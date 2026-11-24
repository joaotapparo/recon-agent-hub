"""Logging estruturado (issue #28)."""

import asyncio
import io
import json
import logging

import pytest

from app.core.logging import configure_logging, scan_id_var


@pytest.fixture
def captured():
    """Configura o logging escrevendo num buffer e devolve as linhas emitidas."""
    buffer = io.StringIO()
    root = logging.getLogger()
    saved = (root.handlers[:], root.level)

    def lines(fmt="json"):
        configure_logging("INFO", fmt)
        # o pytest troca o sys.stderr entre o setup e o teste: aponta direto pro buffer
        root.handlers[0].setStream(buffer)
        return buffer

    yield lines
    root.handlers, root.level = saved


def records(buffer):
    return [json.loads(line) for line in buffer.getvalue().splitlines()]


def test_cada_linha_e_um_json_com_os_campos_basicos(captured):
    buffer = captured()
    logging.getLogger("app.teste").info("scan %s concluido", 7)

    [rec] = records(buffer)
    assert rec["level"] == "INFO"
    assert rec["logger"] == "app.teste"
    assert rec["message"] == "scan 7 concluido"
    assert rec["time"].endswith("+00:00")
    assert "scan_id" not in rec  # fora de uma analise


def test_linhas_dentro_de_uma_analise_levam_o_scan_id_ate_em_tarefas_filhas(captured):
    buffer = captured()
    log = logging.getLogger("app.teste")

    async def etapa(nome):
        log.warning("etapa %s", nome)

    async def analise():
        token = scan_id_var.set(42)
        try:
            log.info("inicio")
            await asyncio.gather(etapa("nmap"), etapa("httpx"))
        finally:
            scan_id_var.reset(token)
        log.info("depois da analise")

    asyncio.run(analise())

    recs = records(buffer)
    assert [r.get("scan_id") for r in recs] == [42, 42, 42, None]


def test_campos_extras_e_excecao_entram_no_json(captured):
    buffer = captured()
    log = logging.getLogger("app.teste")
    log.info("ferramenta terminou", extra={"tool": "nmap", "duration_s": 2.5})
    try:
        raise ValueError("falhou")
    except ValueError:
        log.exception("erro na etapa")

    info, error = records(buffer)
    assert info["tool"] == "nmap" and info["duration_s"] == 2.5
    assert error["level"] == "ERROR"
    assert "ValueError: falhou" in error["exception"]


def test_acentos_ficam_legiveis(captured):
    buffer = captured()
    logging.getLogger("app.teste").info("análise concluída")
    assert "análise concluída" in buffer.getvalue()


def test_logs_do_uvicorn_saem_no_mesmo_formato(captured):
    buffer = captured()
    logging.getLogger("uvicorn.error").info(
        "Started server process [%d]", 1, extra={"color_message": "\x1b[36m%d\x1b[0m"}
    )
    [rec] = records(buffer)
    assert rec["logger"] == "uvicorn.error"
    assert "color_message" not in rec


def test_requisicoes_http_das_bibliotecas_nao_poluem_o_log(captured):
    buffer = captured()
    logging.getLogger("httpx").info("HTTP Request: POST https://api.exemplo")
    assert buffer.getvalue() == ""


def test_modo_texto_para_desenvolvimento(captured):
    buffer = captured("text")
    token = scan_id_var.set(3)
    try:
        logging.getLogger("app.teste").warning("lento")
    finally:
        scan_id_var.reset(token)
    line = buffer.getvalue()
    assert "WARNING app.teste [scan=3] lento" in line
    with pytest.raises(json.JSONDecodeError):
        json.loads(line)

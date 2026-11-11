import asyncio
import json

from app.tool_wrappers import subfinder


def _run(monkeypatch, stdout: str) -> list[str]:
    async def fake_run_tool(cmd, **kwargs):
        return stdout

    monkeypatch.setattr(subfinder, "run_tool", fake_run_tool)
    return asyncio.run(subfinder.run_subfinder("example.com", scan_job_id=1))


def _lines(*hosts: str) -> str:
    return "\n".join(json.dumps({"host": h, "input": "example.com"}) for h in hosts)


def test_dominio_raiz_entra_mesmo_com_subdominios(monkeypatch):
    # regressao: com subdominios encontrados, o dominio informado ficava de fora
    assert _run(monkeypatch, _lines("www.example.com", "api.example.com")) == [
        "example.com",
        "www.example.com",
        "api.example.com",
    ]


def test_sem_subdominios_retorna_so_o_raiz(monkeypatch):
    assert _run(monkeypatch, "") == ["example.com"]


def test_deduplica_mantendo_ordem(monkeypatch):
    out = _lines("www.example.com", "example.com", "www.example.com")
    assert _run(monkeypatch, out) == ["example.com", "www.example.com"]


def test_ignora_linha_invalida(monkeypatch):
    out = "nao-e-json\n" + _lines("www.example.com")
    assert _run(monkeypatch, out) == ["example.com", "www.example.com"]

"""
core/subprocess_runner.py - executor de subprocessos com timeout (issue #5).

Helper generico, assincrono, usado por todos os tool_wrappers pra rodar
binarios externos (subfinder, httpx, nmap). Salva stdout e stderr de cada
execucao em data/scans/{scan_job_id}/{tool}.json (auditoria/debug, inclusive
quando a ferramenta falha) e padroniza o tratamento de erro/timeout.
"""

import asyncio
import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class ToolError(RuntimeError):
    """Falha ao executar uma ferramenta externa (binario ausente, timeout, codigo != 0)."""


async def run_tool(
    cmd: list[str],
    *,
    scan_job_id: int,
    tool: str,
    input: str | None = None,
    timeout: int | None = None,
) -> str:
    """Roda `cmd` de forma assincrona e retorna o stdout. Levanta ToolError se falhar."""
    timeout = timeout or settings.tool_timeout_seconds

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE if input is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as exc:
        raise ToolError(f"Falha ao executar {cmd[0]}: {exc}") from exc

    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(input.encode() if input is not None else None),
            timeout=timeout,
        )
    except asyncio.TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise ToolError(f"{cmd[0]} excedeu o timeout de {timeout}s") from exc

    stdout = stdout_bytes.decode(errors="replace")
    stderr = stderr_bytes.decode(errors="replace")

    _save_raw_output(scan_job_id, tool, stdout=stdout, stderr=stderr, returncode=proc.returncode)

    if proc.returncode != 0:
        raise ToolError(f"{cmd[0]} terminou com codigo {proc.returncode}: {stderr.strip()}")

    return stdout


def _save_raw_output(scan_job_id: int, tool: str, *, stdout: str, stderr: str, returncode: int) -> None:
    scan_dir = settings.scans_dir / str(scan_job_id)
    try:
        scan_dir.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({"stdout": stdout, "stderr": stderr, "returncode": returncode})
        (scan_dir / f"{tool}.json").write_text(payload)
    except OSError:
        logger.warning(
            "Falha ao salvar saida bruta de %s para scan_job %s", tool, scan_job_id, exc_info=True
        )

"""
tool_wrappers/httpx_cli.py - wrapper de probing HTTP (RF03, issue #3).

Nome do arquivo evita colidir com o pacote pip `httpx` (cliente HTTP)
usado em outras partes do projeto - aqui e o binario de linha de comando
da ProjectDiscovery.

NOTA: a flag `-include-response` (corpo/headers embutidos no JSON, campo
"response") e o nome exato dos campos (`input`/`host`, `a`, `tech`) nao
foram validados contra uma execucao real da ferramenta neste ambiente -
confira com `httpx -h` ao rodar de verdade e ajuste se o nome do flag ou
dos campos tiver mudado de versao.
"""

import json
import logging

from app.config import settings
from app.core.subprocess_runner import run_tool

logger = logging.getLogger(__name__)


async def run_httpx(hosts: list[str], scan_job_id: int) -> list[dict]:
    """Sonda quais hosts respondem HTTP/HTTPS. Retorna um dict por host ativo."""
    if not hosts:
        return []

    stdout = await run_tool(
        [
            settings.httpx_path,
            "-json",
            "-tech-detect",
            "-status-code",
            "-title",
            "-store-response",
            "-include-response",
            "-ip",
        ],
        input="\n".join(hosts),
        scan_job_id=scan_job_id,
        tool="httpx",
    )

    probed = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            probed.append(json.loads(line))
        except json.JSONDecodeError:
            logger.warning("linha invalida no output json do httpx: %s", line)

    return probed

"""Wrapper para o httpx da ProjectDiscovery (sondagem de hosts ativos).

Nome do arquivo evita colidir com o pacote pip `httpx` (cliente HTTP) usado
em outras partes do projeto - aqui e o binario de linha de comando.
"""

import json
import logging

from app.config import settings
from app.tool_wrappers._subprocess import run_tool

logger = logging.getLogger(__name__)


def run_httpx(hosts: list[str]) -> list[dict]:
    """
    RF03 (parte de deteccao de hosts ativos) - sonda quais subdominios
    respondem HTTP/HTTPS. Retorna um dict por host ativo com os campos
    brutos do httpx (json lines): input/host, status_code, title, tech, a...
    """
    if not hosts:
        return []

    stdout = run_tool(
        [
            settings.httpx_path,
            "-silent",
            "-json",
            "-status-code",
            "-title",
            "-tech-detect",
            "-ip",
        ],
        input="\n".join(hosts),
        timeout=settings.tool_timeout_seconds,
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

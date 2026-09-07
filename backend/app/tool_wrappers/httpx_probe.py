"""Wrapper para o httpx da ProjectDiscovery (sondagem de hosts ativos).

Nome do arquivo evita colidir com o pacote pip `httpx` (cliente HTTP) usado
em outras partes do projeto - aqui e o binario de linha de comando.
"""

import json
import subprocess

from app.config import settings


def run_httpx(hosts: list[str]) -> list[dict]:
    """
    RF03 (parte de deteccao de hosts ativos) - sonda quais subdominios
    respondem HTTP/HTTPS. Retorna um dict por host ativo com os campos
    brutos do httpx (json lines): input/host, status_code, title, tech, a...
    """
    if not hosts:
        return []

    result = subprocess.run(
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
        capture_output=True,
        text=True,
        timeout=settings.tool_timeout_seconds,
    )

    probed = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            probed.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    return probed

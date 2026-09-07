"""Wrapper para o nmap (varredura de portas).

Usa subprocess + saida XML (parseada com a stdlib) em vez da lib
`python-nmap`, pra nao adicionar mais uma dependencia externa - segue o
mesmo padrao de subprocess dos outros wrappers (subfinder, httpx).
"""

import xml.etree.ElementTree as ET

from app.config import settings
from app.tool_wrappers._subprocess import run_tool


def run_nmap(host: str) -> list[dict]:
    """RF03 - identifica portas abertas no host (top 100 portas, scan rapido).

    Levanta RuntimeError se o nmap falhar (binario ausente, timeout, codigo
    de saida != 0, ex.: falta de permissao pra scan SYN). Quem chama por
    varios hosts deve tratar isso por host, pra falha num host nao derrubar
    o scan inteiro (ver app/services/recon).
    """
    stdout = run_tool(
        [settings.nmap_path, "-T4", "-F", "-oX", "-", host],
        timeout=settings.tool_timeout_seconds,
    )

    try:
        root = ET.fromstring(stdout)
    except ET.ParseError:
        return []

    open_ports = []
    for port_el in root.findall(".//port"):
        state_el = port_el.find("state")
        if state_el is None or state_el.get("state") != "open":
            continue
        service_el = port_el.find("service")
        open_ports.append({
            "port": int(port_el.get("portid")),
            "protocol": port_el.get("protocol"),
            "service": service_el.get("name") if service_el is not None else None,
        })

    return open_ports

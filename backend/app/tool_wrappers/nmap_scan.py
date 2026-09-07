"""Wrapper para o nmap (varredura de portas).

Usa subprocess + saida XML (parseada com a stdlib) em vez da lib
`python-nmap`, pra nao adicionar mais uma dependencia externa - segue o
mesmo padrao de subprocess dos outros wrappers (subfinder, httpx).
"""

import subprocess
import xml.etree.ElementTree as ET

from app.config import settings


def run_nmap(host: str) -> list[dict]:
    """RF03 - identifica portas abertas no host (top 100 portas, scan rapido)."""
    result = subprocess.run(
        [settings.nmap_path, "-T4", "-F", "-oX", "-", host],
        capture_output=True,
        text=True,
        timeout=settings.tool_timeout_seconds,
    )

    try:
        root = ET.fromstring(result.stdout)
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

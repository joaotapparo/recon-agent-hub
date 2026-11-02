"""
tool_wrappers/nmap.py - wrapper de port scan (RF03, issue #4).

Usa -sT (TCP connect scan) de proposito: nao exige privilegio root, ao
contrario do SYN scan (-sS) que o nmap usa por padrao quando roda como
root - evita comportamento diferente dependendo de quem/como o processo
sobe na instancia.
"""

import xml.etree.ElementTree as ET

from app.config import settings
from app.core.subprocess_runner import run_tool


async def run_nmap(host: str, scan_job_id: int) -> list[dict]:
    """Identifica portas abertas e servicos no host (top 100 portas, scan rapido)."""
    stdout = await run_tool(
        [settings.nmap_path, "-sT", "-T4", "-F", "-oX", "-", host],
        scan_job_id=scan_job_id,
        tool="nmap",
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

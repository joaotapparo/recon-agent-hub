"""tool_wrappers/subfinder.py - wrapper de enumeracao de subdominios (RF02, issue #2)."""

import json
import logging

from app.config import settings
from app.core.subprocess_runner import run_tool

logger = logging.getLogger(__name__)


async def run_subfinder(domain: str, scan_job_id: int) -> list[str]:
    """
    Enumera subdominios ativos do dominio informado. Retorna [domain] se a
    ferramenta rodar com sucesso mas nao achar nenhum subdominio.
    """
    stdout = await run_tool(
        [settings.subfinder_path, "-d", domain, "-json"],
        scan_job_id=scan_job_id,
        tool="subfinder",
    )

    hosts: list[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            logger.warning("linha invalida no output json do subfinder: %s", line)
            continue
        host = data.get("host")
        if host:
            hosts.append(host)

    if not hosts:
        logger.info("subfinder nao encontrou subdominios para %s; usando so o dominio raiz", domain)
        return [domain]

    return hosts

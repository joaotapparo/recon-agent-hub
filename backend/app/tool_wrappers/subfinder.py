"""Wrapper para o subfinder (enumeracao de subdominios)."""

import logging

from app.config import settings
from app.tool_wrappers._subprocess import run_tool

logger = logging.getLogger(__name__)


def run_subfinder(domain: str) -> list[str]:
    """RF02 - enumera subdominios ativos associados ao dominio informado.

    Levanta RuntimeError se o subfinder falhar (binario ausente, timeout,
    codigo de saida != 0) - so retorna [domain] quando a ferramenta rodou
    com sucesso e genuinamente nao achou nenhum subdominio.
    """
    stdout = run_tool(
        [settings.subfinder_path, "-d", domain, "-silent"],
        timeout=settings.tool_timeout_seconds,
    )

    hosts = [line.strip() for line in stdout.splitlines() if line.strip()]
    if not hosts:
        logger.info("subfinder nao encontrou subdominios para %s; usando so o dominio raiz", domain)
        return [domain]

    return hosts

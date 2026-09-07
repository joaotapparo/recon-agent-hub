"""Wrapper para o subfinder (enumeracao de subdominios)."""

import subprocess

from app.config import settings


def run_subfinder(domain: str) -> list[str]:
    """RF02 - enumera subdominios ativos associados ao dominio informado."""
    result = subprocess.run(
        [settings.subfinder_path, "-d", domain, "-silent"],
        capture_output=True,
        text=True,
        timeout=settings.tool_timeout_seconds,
    )
    hosts = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return hosts or [domain]

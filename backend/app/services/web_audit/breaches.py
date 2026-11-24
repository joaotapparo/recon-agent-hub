"""
E-mails do dominio em vazamentos de dados conhecidos (HaveIBeenPwned).

OPCIONAL e pago: exige HIBP_API_KEY com assinatura que inclua busca por
dominio, e o dominio verificado no painel do HIBP (a propria HIBP exige
provar posse). Sem chave, a consulta e pulada.

Privacidade: a API devolve os e-mails (parte antes do @). Guardamos so a
contagem por vazamento e exemplos MASCARADOS (j***), nunca a lista completa.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

HIBP_URL = "https://haveibeenpwned.com/api/v3/breacheddomain/{domain}"
_SAMPLE = 5


class BreachLookupError(Exception):
    pass


async def check_breaches(domain: str) -> dict | None:
    """None se a consulta esta desativada (sem chave). Levanta BreachLookupError se a API recusar."""
    if not settings.hibp_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                HIBP_URL.format(domain=domain),
                headers={"hibp-api-key": settings.hibp_api_key, "user-agent": "recon-agent-hub"},
            )
    except httpx.HTTPError as exc:
        raise BreachLookupError(f"HaveIBeenPwned indisponível: {exc}") from exc

    if response.status_code == 404:
        return summarize_breaches(domain, {})
    if response.status_code in (401, 403):
        raise BreachLookupError("chave do HaveIBeenPwned inválida ou domínio não verificado no painel do HIBP")
    if response.status_code == 429:
        raise BreachLookupError("limite de consultas do HaveIBeenPwned atingido")
    if response.status_code != 200:
        raise BreachLookupError(f"HaveIBeenPwned respondeu HTTP {response.status_code}")
    return summarize_breaches(domain, response.json())


def summarize_breaches(domain: str, data: dict[str, list[str]]) -> dict:
    per_breach: dict[str, int] = {}
    for breaches in data.values():
        for name in breaches:
            per_breach[name] = per_breach.get(name, 0) + 1
    return {
        "domain": domain,
        "accounts": len(data),
        "breaches": dict(sorted(per_breach.items(), key=lambda kv: kv[1], reverse=True)),
        "sample_accounts": [f"{_mask(alias)}@{domain}" for alias in sorted(data)[:_SAMPLE]],
        "source": "HaveIBeenPwned",
    }


def _mask(alias: str) -> str:
    return (alias[:1] + "***") if alias else "***"

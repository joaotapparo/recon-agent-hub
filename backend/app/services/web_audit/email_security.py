"""
SPF e DMARC do dominio raiz: alguem consegue mandar e-mail se passando por ele?

So consulta registros TXT publicos no DNS - nenhum contato com o servidor
do alvo.
"""

import asyncio
import logging

import dns.exception
import dns.resolver

logger = logging.getLogger(__name__)


async def check_email_security(domain: str) -> dict | None:
    """None se o DNS falhou - sem resposta nao da pra afirmar que falta registro."""
    spf_records, dmarc_records = await asyncio.gather(
        asyncio.to_thread(_txt_records, domain),
        asyncio.to_thread(_txt_records, f"_dmarc.{domain}"),
    )
    if spf_records is None or dmarc_records is None:
        return None
    return analyze_email_records(
        domain,
        [r for r in spf_records if r.lower().startswith("v=spf1")],
        [r for r in dmarc_records if r.lower().startswith("v=dmarc1")],
    )


def analyze_email_records(domain: str, spf: list[str], dmarc: list[str]) -> dict:
    issues: list[str] = []

    if not spf:
        issues.append("sem registro SPF")
    elif len(spf) > 1:
        issues.append("mais de um registro SPF (inválido pela RFC 7208)")
    elif spf[0].replace(" ", "").lower().endswith(("+all", "?all")) or spf[0].strip().lower().endswith(" all"):
        issues.append("SPF termina em +all/?all e autoriza qualquer servidor")

    policy = None
    if not dmarc:
        issues.append("sem registro DMARC")
    else:
        tags = dict(
            part.strip().split("=", 1) for part in dmarc[0].split(";") if "=" in part
        )
        policy = tags.get("p", "").strip().lower() or None
        if policy in (None, "none"):
            issues.append("DMARC em modo p=none (só monitora, não bloqueia)")

    return {
        "domain": domain,
        "spf": spf[0] if spf else None,
        "dmarc": dmarc[0] if dmarc else None,
        "dmarc_policy": policy,
        "issues": issues,
    }


def _txt_records(name: str) -> list[str] | None:
    try:
        answers = dns.resolver.resolve(name, "TXT")
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return []
    except dns.exception.DNSException:
        logger.warning("falha ao consultar TXT de %s", name, exc_info=True)
        return None
    return [b"".join(r.strings).decode(errors="replace") for r in answers]

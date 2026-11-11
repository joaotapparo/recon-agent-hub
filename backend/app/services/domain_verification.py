"""
services/domain_verification.py - prova de posse do dominio por DNS.

A caixinha "tenho autorizacao" e so uma declaracao. Antes de escanear,
pedimos que o dono publique um registro TXT com um codigo unico:

    _recon-agent-hub.empresa.com.br  TXT  "recon-agent-hub-verify=<token>"

So quem controla o DNS do dominio consegue fazer isso. A verificacao vale
`settings.domain_verification_valid_days`; depois disso o proximo scan
confere o registro de novo, automaticamente.
"""

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

import dns.exception
import dns.resolver

from app.config import settings
from app.models import Domain

logger = logging.getLogger(__name__)

RECORD_PREFIX = "_recon-agent-hub"
VALUE_PREFIX = "recon-agent-hub-verify="


@dataclass(frozen=True)
class Challenge:
    record_name: str
    record_type: str
    record_value: str


class VerificationFailed(Exception):
    pass


def is_exempt(domain_name: str) -> bool:
    name = domain_name.lower()
    return any(name == d or name.endswith("." + d) for d in settings.verification_exempt_domains)


def is_verified(domain: Domain, *, now: datetime | None = None) -> bool:
    if not settings.domain_verification_required or is_exempt(domain.name):
        return True
    if domain.verified_at is None:
        return False
    now = now or datetime.utcnow()
    return now - domain.verified_at <= timedelta(days=settings.domain_verification_valid_days)


def challenge_for(domain: Domain) -> Challenge:
    """Gera o token na primeira vez; depois devolve sempre o mesmo."""
    if not domain.verification_token:
        domain.verification_token = secrets.token_urlsafe(24)
    return Challenge(
        record_name=f"{RECORD_PREFIX}.{domain.name}",
        record_type="TXT",
        record_value=f"{VALUE_PREFIX}{domain.verification_token}",
    )


def verify(domain: Domain) -> None:
    """
    Consulta o DNS e marca o dominio como verificado. Levanta
    VerificationFailed com uma mensagem pra mostrar ao usuario.
    Sincrono: chamar de rota `def` (threadpool) ou via asyncio.to_thread.
    """
    challenge = challenge_for(domain)
    found = _txt_values(challenge.record_name)
    if challenge.record_value not in found:
        if found:
            raise VerificationFailed(
                f"O registro {challenge.record_name} existe, mas o valor não confere. "
                f"Esperado: {challenge.record_value}"
            )
        raise VerificationFailed(
            f"Registro TXT {challenge.record_name} não encontrado. Depois de criar, a "
            "propagação do DNS pode levar alguns minutos."
        )
    domain.verified_at = datetime.utcnow()
    domain.authorized = True
    domain.authorized_at = domain.authorized_at or domain.verified_at


def _txt_values(name: str) -> list[str]:
    resolver = dns.resolver.Resolver()
    resolver.lifetime = 8
    try:
        answers = resolver.resolve(name, "TXT")
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return []
    except dns.exception.DNSException as exc:
        logger.warning("falha ao consultar TXT de verificacao %s: %s", name, exc)
        raise VerificationFailed("Não foi possível consultar o DNS agora. Tente de novo em instantes.") from exc
    return [b"".join(r.strings).decode(errors="replace").strip() for r in answers]

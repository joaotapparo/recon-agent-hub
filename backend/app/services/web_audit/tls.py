"""
Certificado TLS: valido, confiavel, perto de expirar?

Conecta na porta 443 com a verificacao padrao do Python (cadeia confiavel +
nome do host). Nao baixa nada alem do handshake.
"""

import asyncio
import logging
import ssl
from dataclasses import dataclass
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

EXPIRY_WARNING_DAYS = 30


@dataclass(frozen=True)
class CertInfo:
    hostname: str
    valid: bool
    error: str | None = None
    issuer: str | None = None
    not_after: datetime | None = None
    tls_version: str | None = None

    @property
    def days_left(self) -> int | None:
        if self.not_after is None:
            return None
        return (self.not_after - datetime.now(UTC)).days

    def evidence(self) -> dict:
        return {
            "hostname": self.hostname,
            "valid": self.valid,
            "error": self.error,
            "issuer": self.issuer,
            "not_after": self.not_after.isoformat() if self.not_after else None,
            "days_left": self.days_left,
            "tls_version": self.tls_version,
        }


async def inspect_certificate(hostname: str, *, port: int = 443, timeout: float = 10) -> CertInfo | None:
    """None quando nao deu pra conectar (porta fechada, timeout) - nao e achado."""
    context = ssl.create_default_context()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(hostname, port, ssl=context, server_hostname=hostname),
            timeout=timeout,
        )
    except ssl.SSLCertVerificationError as exc:
        return CertInfo(hostname=hostname, valid=False, error=exc.verify_message or str(exc))
    except (OSError, TimeoutError, ssl.SSLError) as exc:
        logger.warning("TLS de %s indisponivel: %s", hostname, exc)
        return None

    try:
        ssl_obj = writer.get_extra_info("ssl_object")
        cert = ssl_obj.getpeercert() if ssl_obj else None
        return CertInfo(
            hostname=hostname,
            valid=True,
            issuer=_issuer_name(cert),
            not_after=_not_after(cert),
            tls_version=ssl_obj.version() if ssl_obj else None,
        )
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except (OSError, ssl.SSLError):
            pass


def _issuer_name(cert: dict | None) -> str | None:
    if not cert:
        return None
    fields = {k: v for rdn in cert.get("issuer", ()) for k, v in rdn}
    return fields.get("organizationName") or fields.get("commonName")


def _not_after(cert: dict | None) -> datetime | None:
    if not cert or "notAfter" not in cert:
        return None
    return datetime.fromtimestamp(ssl.cert_time_to_seconds(cert["notAfter"]), UTC)

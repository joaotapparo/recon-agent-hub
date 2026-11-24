"""
Protecoes do DNS do dominio raiz: DNSSEC e CAA.

- DNSSEC (registro DS na zona pai): sem ele, um atacante na rede pode
  falsificar respostas de DNS e desviar visitantes para um servidor falso.
- CAA: diz quais autoridades podem emitir certificado para o dominio; sem
  ele, qualquer autoridade pode (aumenta o risco de certificado indevido).

So consultas DNS publicas, nenhum contato com o servidor do alvo.
"""

import asyncio
import logging

import dns.exception
import dns.resolver

logger = logging.getLogger(__name__)


class _DnsFailure(Exception):
    pass


async def check_dns_security(domain: str) -> dict | None:
    """None se o DNS falhou - sem resposta nao da pra afirmar que falta protecao."""
    try:
        has_ds, caa = await asyncio.gather(
            asyncio.to_thread(_has_record, domain, "DS"),
            asyncio.to_thread(_caa_records, domain),
        )
    except _DnsFailure:
        return None
    return analyze_dns_security(domain, dnssec=has_ds, caa=caa)


def analyze_dns_security(domain: str, *, dnssec: bool, caa: list[str]) -> dict:
    issues = []
    if not dnssec:
        issues.append("DNSSEC não habilitado")
    if not caa:
        issues.append("sem registro CAA (qualquer autoridade pode emitir certificado)")
    return {"domain": domain, "dnssec": dnssec, "caa": caa, "issues": issues}


def _has_record(name: str, rdtype: str) -> bool:
    try:
        dns.resolver.resolve(name, rdtype)
        return True
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return False
    except dns.exception.DNSException as exc:
        logger.warning("falha ao consultar %s de %s: %s", rdtype, name, exc)
        raise _DnsFailure from exc


def _caa_records(domain: str) -> list[str]:
    """CAA vale para os subdominios: sobe a arvore ate o dominio registrado (ex.: a.b.com -> b.com)."""
    labels = domain.split(".")
    for i in range(len(labels) - 1):
        name = ".".join(labels[i:])
        try:
            return [r.to_text() for r in dns.resolver.resolve(name, "CAA")]
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            continue
        except dns.exception.DNSException as exc:
            logger.warning("falha ao consultar CAA de %s: %s", name, exc)
            raise _DnsFailure from exc
    return []

"""
Auditoria Web - verificacoes passivas de configuracao, depois do recon.

Para cada host ativo (dentro do dominio autorizado e liberado pelo
ssrf_guard):

1. cabecalhos de seguranca, vazamento de versao e flags de cookie (headers.py);
2. CORS que aceita qualquer origem (cors.py);
3. HTTPS disponivel e certificado TLS valido/perto de expirar (tls.py);

e, uma vez por scan, SPF/DMARC do dominio raiz (email_security.py).

Nada aqui explora falha: sao no maximo duas requisicoes GET e um handshake
TLS por host, iguais ao que um navegador faz. Os achados nascem
`ai_verdict=PENDING` pra IA dar a severidade, como os do modulo Codigo Web.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIVerdict, EventKind, Finding, FindingCategory, ScanJob
from app.services.js_scanner import LiveHost
from app.services.js_scanner.discovery import is_in_scope
from app.services.js_scanner.downloader import HostGuard, build_client
from app.services.scan_events import emit
from app.services.web_audit.cors import PROBE_ORIGIN, analyze_cors
from app.services.web_audit.email_security import check_email_security
from app.services.web_audit.headers import SECURITY_HEADERS, analyze_headers
from app.services.web_audit.tls import (
    EXPIRY_WARNING_DAYS,
    CertInfo,
    inspect_certificate,
)

logger = logging.getLogger(__name__)

__all__ = ["audit_hosts"]

STAGE = "web_audit"
_MAX_PARALLEL_HOSTS = 8
_TARGET_MAX = 512


@dataclass
class _HostResult:
    host: LiveHost
    findings: list[Finding] = field(default_factory=list)
    events: list[tuple[EventKind, str]] = field(default_factory=list)


async def audit_hosts(db: Session, scan_job: ScanJob, live_hosts: list[LiveHost]) -> None:
    domain_name = scan_job.domain.name
    hosts = [h for h in live_hosts if is_in_scope(h.url, domain_name)]
    guard = HostGuard()
    semaphore = asyncio.Semaphore(_MAX_PARALLEL_HOSTS)

    emit(db, scan_job.id, STAGE, f"Verificando a configuração de segurança de {len(hosts)} site(s)")

    async with build_client() as client:
        async def audit(host: LiveHost) -> _HostResult:
            async with semaphore:
                return await _audit_host(client, guard, scan_job, host)

        # resultados ficam em memoria e a sessao so e usada aqui, fora das tasks
        for coro in asyncio.as_completed([audit(h) for h in hosts]):
            result = await coro
            for kind, message in result.events:
                emit(db, scan_job.id, STAGE, message, kind)
            for finding in result.findings:
                db.add(finding)
            db.commit()

    emit(db, scan_job.id, STAGE, f"Consultando SPF e DMARC de {domain_name} (proteção contra e-mail falso)")
    email = await check_email_security(domain_name)
    if email is None:
        emit(db, scan_job.id, STAGE, "Não foi possível consultar o DNS de e-mail", EventKind.WARN)
    elif email["issues"]:
        emit(db, scan_job.id, STAGE, f"E-mail: {'; '.join(email['issues'])}", EventKind.WARN)
        db.add(_finding(
            scan_job, None,
            source_tool="email-security",
            title=f"Dominio {domain_name} permite e-mail falsificado (SPF/DMARC fraco)",
            target=domain_name,
            evidence=email,
        ))
        db.commit()
    else:
        emit(db, scan_job.id, STAGE, f"E-mail protegido: DMARC p={email['dmarc_policy']}", EventKind.FOUND)


async def _audit_host(
    client: httpx.AsyncClient, guard: HostGuard, scan_job: ScanJob, host: LiveHost
) -> _HostResult:
    result = _HostResult(host=host)
    if not await guard.is_public(host.url):
        result.events.append((EventKind.WARN, f"{host.hostname} ignorado (resolve para IP interno)"))
        return result

    response = await _get_headers(client, host.url)
    if response is not None:
        _check_headers(scan_job, result, response)
    cors_response = await _get_headers(client, host.url, origin=PROBE_ORIGIN)
    if cors_response is not None:
        _check_cors(scan_job, result, cors_response)
    await _check_tls(scan_job, result)
    return result


async def _get_headers(client: httpx.AsyncClient, url: str, *, origin: str | None = None) -> httpx.Response | None:
    """Le so os cabecalhos: o stream e fechado sem baixar o corpo."""
    try:
        async with client.stream("GET", url, headers={"Origin": origin} if origin else None) as response:
            return response
    except httpx.HTTPError as exc:
        logger.warning("falha ao consultar %s: %s", url, exc)
        return None


def _check_headers(scan_job: ScanJob, result: _HostResult, response: httpx.Response) -> None:
    host = result.host
    report = analyze_headers(
        host.url, response.status_code, response.headers, response.headers.get_list("set-cookie")
    )
    if report.missing or report.insecure_cookies:
        names = [SECURITY_HEADERS[h][0] for h in report.missing]
        parts = []
        if names:
            parts.append(f"faltam {', '.join(names)}")
        if report.insecure_cookies:
            parts.append(f"{len(report.insecure_cookies)} cookie(s) sem proteção")
        result.events.append((EventKind.WARN, f"{host.hostname}: {'; '.join(parts)}"))
        result.findings.append(_finding(
            scan_job, host,
            source_tool="security-headers",
            title=f"{len(names)} cabecalho(s) de seguranca ausente(s) em {host.hostname}",
            target=host.url,
            evidence=report.missing_evidence(),
        ))
    else:
        result.events.append((EventKind.FOUND, f"{host.hostname}: todos os cabeçalhos de segurança presentes"))

    if report.disclosed:
        shown = ", ".join(f"{k}: {v}" for k, v in report.disclosed.items())
        result.events.append((EventKind.WARN, f"{host.hostname} revela a versão do servidor ({shown})"))
        result.findings.append(_finding(
            scan_job, host,
            source_tool="security-headers",
            title=f"Versao de software exposta nos cabecalhos de {host.hostname}",
            target=host.url,
            evidence=report.disclosure_evidence(),
        ))


def _check_cors(scan_job: ScanJob, result: _HostResult, response: httpx.Response) -> None:
    host = result.host
    issue = analyze_cors(host.url, response.status_code, response.headers)
    if issue is None:
        return
    creds = " com credenciais" if issue["access_control_allow_credentials"] else ""
    result.events.append((EventKind.ALERT, f"{host.hostname} aceita requisições de qualquer site{creds} (CORS)"))
    result.findings.append(_finding(
        scan_job, host,
        source_tool="cors-check",
        title=f"CORS permite origem arbitraria{creds} em {host.hostname}",
        target=host.url,
        evidence=issue,
    ))


async def _check_tls(scan_job: ScanJob, result: _HostResult) -> None:
    host = result.host
    if urlsplit(host.url).scheme != "https":
        result.events.append((EventKind.ALERT, f"{host.hostname} só responde em HTTP, sem cadeado (HTTPS)"))
        result.findings.append(_finding(
            scan_job, host,
            source_tool="tls-check",
            title=f"{host.hostname} nao oferece HTTPS",
            target=host.url,
            evidence={"url": host.url, "issue": "no_https"},
        ))
        return

    cert = await inspect_certificate(host.hostname, timeout=settings.http_timeout_seconds)
    if cert is None:
        return
    if not cert.valid:
        result.events.append((EventKind.ALERT, f"Certificado de {host.hostname} inválido: {cert.error}"))
        result.findings.append(_finding(
            scan_job, host,
            source_tool="tls-check",
            title=f"Certificado TLS invalido em {host.hostname}",
            target=host.url,
            evidence=cert.evidence(),
        ))
        return

    days = cert.days_left
    if days is not None and days < EXPIRY_WARNING_DAYS:
        result.events.append((EventKind.WARN, f"Certificado de {host.hostname} expira em {days} dia(s)"))
        result.findings.append(_finding(
            scan_job, host,
            source_tool="tls-check",
            title=f"Certificado TLS de {host.hostname} expira em {days} dia(s)",
            target=host.url,
            evidence=cert.evidence(),
        ))
    else:
        result.events.append((EventKind.FOUND, _cert_ok_message(cert)))


def _cert_ok_message(cert: CertInfo) -> str:
    parts = [f"Cadeado OK em {cert.hostname}"]
    if cert.issuer:
        parts.append(f"emitido por {cert.issuer}")
    if cert.days_left is not None:
        parts.append(f"válido por mais {cert.days_left} dias")
    if cert.tls_version:
        parts.append(cert.tls_version)
    return " - ".join(parts)


def _finding(
    scan_job: ScanJob, host: LiveHost | None, *, source_tool: str, title: str, target: str, evidence: dict
) -> Finding:
    return Finding(
        scan_job_id=scan_job.id,
        domain_id=scan_job.domain_id,
        subdomain_id=host.subdomain_id if host else None,
        category=FindingCategory.MISCONFIGURATION,
        source_tool=source_tool,
        title=title[:255],
        target=target[:_TARGET_MAX],
        raw_evidence=evidence,
        ai_verdict=AIVerdict.PENDING,
    )

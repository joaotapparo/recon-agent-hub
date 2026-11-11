"""
Auditoria Web - verificacoes passivas de configuracao, depois do recon.

Para cada host ativo (dentro do dominio autorizado e liberado pelo
ssrf_guard):

1. cabecalhos de seguranca, vazamento de versao e flags de cookie (headers.py);
2. CORS que aceita qualquer origem (cors.py);
3. HTTPS disponivel e certificado TLS valido/perto de expirar (tls.py);
4. firewall de aplicacao/CDN pela assinatura dos cabecalhos (waf.py);
5. versoes de software expostas -> CVEs conhecidos no NVD (cve_lookup.py);

e, uma vez por scan, no dominio raiz: SPF/DMARC (email_security.py),
DNSSEC/CAA (dns_security.py) e, se HIBP_API_KEY estiver configurada,
e-mails do dominio em vazamentos (breaches.py).

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
from app.models import (
    AIVerdict,
    EventKind,
    Finding,
    FindingCategory,
    ScanJob,
    Subdomain,
)
from app.services.js_scanner import LiveHost
from app.services.js_scanner.discovery import is_in_scope
from app.services.js_scanner.downloader import HostGuard, build_client
from app.services.scan_events import emit
from app.services.web_audit.breaches import BreachLookupError, check_breaches
from app.services.web_audit.cors import PROBE_ORIGIN, analyze_cors
from app.services.web_audit.cve_lookup import (
    Component,
    NvdClient,
    components_from,
    merge,
    summarize,
)
from app.services.web_audit.dns_security import check_dns_security
from app.services.web_audit.email_security import check_email_security
from app.services.web_audit.headers import SECURITY_HEADERS, analyze_headers
from app.services.web_audit.tls import (
    EXPIRY_WARNING_DAYS,
    CertInfo,
    inspect_certificate,
)
from app.services.web_audit.waf import detect_waf

logger = logging.getLogger(__name__)

__all__ = ["audit_hosts"]

STAGE = "web_audit"
_MAX_PARALLEL_HOSTS = 8
_TARGET_MAX = 512
_MAX_COMPONENTS = 8  # cada um e uma consulta ao NVD (6,5 s sem chave)


@dataclass
class _HostResult:
    host: LiveHost
    findings: list[Finding] = field(default_factory=list)
    events: list[tuple[EventKind, str]] = field(default_factory=list)
    waf: str | None = None  # None = nao verificado, "" = nenhuma assinatura
    components: list[Component] = field(default_factory=list)


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
        components: list[Component] = []
        for coro in asyncio.as_completed([audit(h) for h in hosts]):
            result = await coro
            for kind, message in result.events:
                emit(db, scan_job.id, STAGE, message, kind)
            for finding in result.findings:
                db.add(finding)
            if result.waf is not None and result.host.subdomain_id is not None:
                subdomain = db.get(Subdomain, result.host.subdomain_id)
                if subdomain is not None:
                    subdomain.waf = result.waf
            components += result.components
            db.commit()

    await _check_cves(db, scan_job, merge(components))

    emit(db, scan_job.id, STAGE, f"Consultando SPF e DMARC de {domain_name} (proteção contra e-mail falso)")
    email = await check_email_security(domain_name)
    if email is None:
        emit(db, scan_job.id, STAGE, "Não foi possível consultar o DNS de e-mail", EventKind.WARN)
    elif email["issues"]:
        emit(db, scan_job.id, STAGE, f"E-mail: {'; '.join(email['issues'])}", EventKind.WARN)
        db.add(_finding(
            scan_job, None,
            source_tool="email-security",
            title=f"Domínio {domain_name} permite e-mail falsificado (SPF/DMARC fraco)",
            target=domain_name,
            evidence=email,
        ))
        db.commit()
    else:
        emit(db, scan_job.id, STAGE, f"E-mail protegido: DMARC p={email['dmarc_policy']}", EventKind.FOUND)

    await _check_dns(db, scan_job)
    await _check_breaches(db, scan_job)


async def _check_cves(db: Session, scan_job: ScanJob, components: list[Component]) -> None:
    emit(db, scan_job.id, STAGE, "Procurando falhas conhecidas nas versões de software (base pública NVD)")
    if not components:
        emit(db, scan_job.id, STAGE, "Nenhuma versão exata de software ficou exposta", EventKind.FOUND)
        return
    nvd = NvdClient()
    for component in components[:_MAX_COMPONENTS]:
        label = f"{component.name} {component.version}"
        emit(db, scan_job.id, STAGE, f"Consultando falhas públicas de {label}")
        data = await nvd.lookup(component)
        if data is None:
            emit(db, scan_job.id, STAGE, f"Não foi possível consultar a base de falhas para {label}", EventKind.WARN)
            continue
        summary = summarize(component, data)
        total = summary["total_cves"]
        if not total:
            emit(db, scan_job.id, STAGE, f"{label}: nenhuma falha pública conhecida", EventKind.FOUND)
            continue
        critical = summary["by_severity"].get("CRITICAL", 0)
        exploited = len(summary["known_exploited"])
        message = f"{label}: {total} falha(s) pública(s) conhecida(s)"
        if critical:
            message += f", {critical} crítica(s)"
        if exploited:
            message += f", {exploited} já explorada(s) por criminosos"
        emit(db, scan_job.id, STAGE, message, EventKind.ALERT if critical or exploited else EventKind.WARN)
        db.add(_finding(
            scan_job, None,
            category=FindingCategory.VULNERABLE_COMPONENT,
            source_tool="cve-lookup",
            title=f"{label} com {total} falha(s) pública(s) conhecida(s) (CVE)",
            target=component.hosts[0],
            evidence=summary,
        ))
        db.commit()


async def _check_dns(db: Session, scan_job: ScanJob) -> None:
    domain_name = scan_job.domain.name
    emit(db, scan_job.id, STAGE, "Verificando a proteção do DNS (DNSSEC e CAA)")
    result = await check_dns_security(domain_name)
    if result is None:
        emit(db, scan_job.id, STAGE, "Não foi possível consultar a proteção do DNS", EventKind.WARN)
    elif result["issues"]:
        emit(db, scan_job.id, STAGE, f"DNS: {'; '.join(result['issues'])}", EventKind.WARN)
        db.add(_finding(
            scan_job, None,
            source_tool="dns-security",
            title=f"Proteções de DNS ausentes em {domain_name} ({', '.join(result['issues'])})",
            target=domain_name,
            evidence=result,
        ))
        db.commit()
    else:
        emit(db, scan_job.id, STAGE, "DNS protegido: DNSSEC ativo e CAA configurado", EventKind.FOUND)


async def _check_breaches(db: Session, scan_job: ScanJob) -> None:
    domain_name = scan_job.domain.name
    if not settings.hibp_api_key:
        return  # opcional e pago: sem chave nao ha evento, e o painel mostra "Nao testado"
    emit(db, scan_job.id, STAGE, f"Consultando vazamentos de dados com e-mails @{domain_name} (HaveIBeenPwned)")
    try:
        result = await check_breaches(domain_name)
    except BreachLookupError as exc:
        emit(db, scan_job.id, STAGE, f"Consulta de vazamentos falhou: {exc}", EventKind.WARN)
        return
    if not result or not result["accounts"]:
        emit(db, scan_job.id, STAGE, "Nenhum e-mail do domínio em vazamentos conhecidos", EventKind.FOUND)
        return
    emit(db, scan_job.id, STAGE,
         f"{result['accounts']} e-mail(s) @{domain_name} apareceram em {len(result['breaches'])} vazamento(s)",
         EventKind.ALERT)
    db.add(_finding(
        scan_job, None,
        category=FindingCategory.CREDENTIAL_LEAK,
        source_tool="hibp",
        title=f"{result['accounts']} e-mail(s) de {domain_name} em vazamentos de dados conhecidos",
        target=domain_name,
        evidence=result,
    ))
    db.commit()


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
        _check_waf(result, response)
        lower = {k.lower(): v for k, v in response.headers.items()}
        result.components = components_from(host.url, lower, host.tech)
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
            title=f"{len(names)} cabeçalho(s) de segurança ausente(s) em {host.hostname}",
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
            title=f"Versão de software exposta nos cabeçalhos de {host.hostname}",
            target=host.url,
            evidence=report.disclosure_evidence(),
        ))


def _check_waf(result: _HostResult, response: httpx.Response) -> None:
    host = result.host
    result.waf = detect_waf(response.headers, response.headers.get_list("set-cookie")) or ""
    if result.waf:
        result.events.append((EventKind.FOUND, f"{host.hostname} protegido por {result.waf} (firewall de aplicação)"))
    else:
        result.events.append((EventKind.WARN, f"{host.hostname}: nenhum firewall de aplicação detectado"))


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
        title=f"CORS permite origem arbitrária{creds} em {host.hostname}",
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
            title=f"{host.hostname} não oferece HTTPS",
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
            title=f"Certificado TLS inválido em {host.hostname}",
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
    scan_job: ScanJob,
    host: LiveHost | None,
    *,
    source_tool: str,
    title: str,
    target: str,
    evidence: dict,
    category: FindingCategory = FindingCategory.MISCONFIGURATION,
) -> Finding:
    return Finding(
        scan_job_id=scan_job.id,
        domain_id=scan_job.domain_id,
        subdomain_id=host.subdomain_id if host else None,
        category=category,
        source_tool=source_tool,
        title=title[:255],
        target=target[:_TARGET_MAX],
        raw_evidence=evidence,
        ai_verdict=AIVerdict.PENDING,
    )

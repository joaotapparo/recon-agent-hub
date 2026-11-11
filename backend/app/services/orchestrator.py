"""
services/orchestrator.py - pipeline do scan (issues #7 e #20).

Coordena enum -> probe -> port_scan -> checking_takeover -> web_audit ->
scanning_js -> triaging pra um scan_job, atualizando o status no banco a cada
etapa e persistindo Subdomain/Finding/Report conforme os modulos retornam dados.

Cada etapa tambem grava eventos (services/scan_events.py) que o painel mostra
como feed ao vivo.
"""

import asyncio
import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.subprocess_runner import ToolError
from app.database import SessionLocal
from app.models import (
    AIVerdict,
    EventKind,
    Finding,
    FindingCategory,
    ScanJob,
    ScanStatus,
    Subdomain,
)
from app.services import ai_triage, js_scanner, web_audit
from app.services.recon.takeover_check import check_takeover
from app.services.scan_events import emit, emit_list
from app.tool_wrappers.httpx_cli import run_httpx
from app.tool_wrappers.nmap import run_nmap
from app.tool_wrappers.subfinder import run_subfinder

logger = logging.getLogger(__name__)


async def run_scan_job(scan_job_id: int) -> None:
    db: Session = SessionLocal()
    try:
        scan_job = db.get(ScanJob, scan_job_id)
        if scan_job is None:
            return

        scan_job.started_at = datetime.utcnow()
        db.commit()

        domain_name = scan_job.domain.name

        _set_status(db, scan_job, ScanStatus.ENUMERATING)
        emit(db, scan_job.id, "enumerating", f"Procurando subdomínios de {domain_name} em fontes públicas (subfinder)")
        hostnames = await run_subfinder(domain_name, scan_job_id)
        emit_list(db, scan_job.id, "enumerating", (f"Subdomínio encontrado: {h}" for h in hostnames))
        emit(db, scan_job.id, "enumerating", f"{len(hostnames)} endereço(s) encontrado(s)", EventKind.FOUND)

        _set_status(db, scan_job, ScanStatus.PROBING)
        emit(db, scan_job.id, "probing", f"Testando quais dos {len(hostnames)} endereço(s) respondem na web (httpx)")
        probed = await run_httpx(hostnames, scan_job_id)
        probed_by_host = {(p.get("input") or p.get("host")): p for p in probed}
        emit_list(db, scan_job.id, "probing", (_probe_message(p) for p in probed))
        emit(db, scan_job.id, "probing", f"{len(probed)} site(s) no ar", EventKind.FOUND)

        subdomains: list[Subdomain] = []
        for hostname in hostnames:
            probe = probed_by_host.get(hostname)
            subdomain = Subdomain(
                scan_job_id=scan_job.id,
                domain_id=scan_job.domain_id,
                hostname=hostname,
                ip_addresses=probe.get("a") if probe else None,
                http_status=probe.get("status_code") if probe else None,
                http_title=probe.get("title") if probe else None,
                tech_stack=probe.get("tech") if probe else None,
            )
            db.add(subdomain)
            subdomains.append(subdomain)
        db.commit()

        _set_status(db, scan_job, ScanStatus.PORT_SCANNING)
        targets = [s for s in subdomains if s.http_status is not None]
        emit(db, scan_job.id, "port_scanning", f"Verificando portas abertas em {len(targets)} servidor(es) (nmap)")
        port_results = await asyncio.gather(*[_scan_ports(s.hostname, scan_job_id) for s in targets])
        for subdomain, open_ports in zip(targets, port_results):
            subdomain.open_ports = open_ports
            if open_ports:
                db.add(Finding(
                    scan_job_id=scan_job.id,
                    domain_id=scan_job.domain_id,
                    subdomain_id=subdomain.id,
                    category=FindingCategory.OPEN_PORT,
                    source_tool="nmap",
                    title=f"Portas abertas em {subdomain.hostname}",
                    target=subdomain.hostname,
                    raw_evidence=open_ports,
                ))
        db.commit()
        emit_list(db, scan_job.id, "port_scanning", (
            f"Porta {p['port']}/{p.get('protocol') or 'tcp'} aberta em {s.hostname} ({p.get('service') or '?'})"
            for s, ports in zip(targets, port_results) for p in ports
        ))
        total_ports = sum(len(p) for p in port_results)
        emit(db, scan_job.id, "port_scanning", f"{total_ports} porta(s) aberta(s) no total", EventKind.FOUND)

        _set_status(db, scan_job, ScanStatus.CHECKING_TAKEOVER)
        emit(db, scan_job.id, "checking_takeover",
             f"Checando se algum dos {len(subdomains)} subdomínio(s) aponta para um serviço abandonado (takeover)")
        takeover_count = 0
        for subdomain in subdomains:
            probe = probed_by_host.get(subdomain.hostname)
            takeover = check_takeover(subdomain.hostname, probe)
            subdomain.takeover_candidate = takeover["is_candidate"]
            subdomain.takeover_fingerprint = takeover["fingerprint"]
            if takeover["is_candidate"]:
                takeover_count += 1
                emit(db, scan_job.id, "checking_takeover",
                     f"{subdomain.hostname} aponta para {takeover['cname']}, que parece abandonado",
                     EventKind.ALERT)
                db.add(Finding(
                    scan_job_id=scan_job.id,
                    domain_id=scan_job.domain_id,
                    subdomain_id=subdomain.id,
                    category=FindingCategory.SUBDOMAIN_TAKEOVER,
                    source_tool="dnspython+httpx",
                    title=f"Possivel subdomain takeover em {subdomain.hostname}",
                    target=subdomain.hostname,
                    raw_evidence={"cname": takeover["cname"], "fingerprint": takeover["fingerprint"]},
                ))
        db.commit()
        if not takeover_count:
            emit(db, scan_job.id, "checking_takeover", "Nenhum risco de takeover encontrado", EventKind.FOUND)

        live_hosts = [
            js_scanner.LiveHost(
                subdomain_id=s.id,
                hostname=s.hostname,
                url=probed_by_host[s.hostname].get("url") or f"https://{s.hostname}",
                body=probed_by_host[s.hostname].get("body"),
            )
            for s in targets
        ]

        _set_status(db, scan_job, ScanStatus.WEB_AUDIT)
        await web_audit.audit_hosts(db, scan_job, live_hosts)

        _set_status(db, scan_job, ScanStatus.SCANNING_JS)
        await js_scanner.scan_hosts(db, scan_job, live_hosts)

        _set_status(db, scan_job, ScanStatus.TRIAGING)
        await _triage(db, scan_job)
        emit(db, scan_job.id, "triaging", "Escrevendo o relatório final")
        await ai_triage.generate_report(db, scan_job)

        scan_job.status = ScanStatus.COMPLETED
        scan_job.finished_at = datetime.utcnow()
        db.commit()
        elapsed = int((scan_job.finished_at - scan_job.started_at).total_seconds())
        emit(db, scan_job.id, "completed", f"Análise concluída em {elapsed // 60}min {elapsed % 60}s", EventKind.FOUND)

    except Exception as exc:
        db.rollback()
        scan_job = db.get(ScanJob, scan_job_id)
        if scan_job is not None:
            scan_job.status = ScanStatus.FAILED
            scan_job.error_message = str(exc)
            scan_job.finished_at = datetime.utcnow()
            db.commit()
            emit(db, scan_job.id, "failed", f"A análise falhou: {exc}", EventKind.ALERT)
        raise
    finally:
        db.close()


def _set_status(db: Session, scan_job: ScanJob, status: ScanStatus) -> None:
    scan_job.status = status
    db.commit()


def _probe_message(probe: dict) -> str:
    url = probe.get("url") or probe.get("input") or "?"
    message = f"{url} respondeu HTTP {probe.get('status_code', '?')}"
    if probe.get("title"):
        message += f" - \"{probe['title']}\""
    if probe.get("tech"):
        message += f" [{', '.join(probe['tech'][:4])}]"
    return message


def _verdict_counts(db: Session, scan_job: ScanJob) -> dict[AIVerdict, int]:
    rows = db.execute(
        select(Finding.ai_verdict, func.count())
        .where(Finding.scan_job_id == scan_job.id)
        .group_by(Finding.ai_verdict)
    )
    return {verdict: count for verdict, count in rows}


async def _scan_ports(hostname: str, scan_job_id: int) -> list[dict]:
    """Falha de nmap num host isolado nao deve abortar o scan inteiro."""
    try:
        return await run_nmap(hostname, scan_job_id)
    except ToolError:
        logger.warning("Falha ao escanear portas de %s", hostname, exc_info=True)
        return []


async def _triage(db: Session, scan_job: ScanJob) -> None:
    """
    Sem GEMINI_API_KEY o scan nao falha: os achados ficam pending e o
    relatorio sai no modo basico (generate_report ja trata esse caso).
    """
    pending = _verdict_counts(db, scan_job).get(AIVerdict.PENDING, 0)
    if not pending:
        emit(db, scan_job.id, "triaging", "Nenhum achado pendente para a IA validar")
        return
    emit(db, scan_job.id, "triaging",
         f"Enviando {pending} achado(s) para a IA separar o que é real do que é alarme falso")
    try:
        await ai_triage.triage_findings(db, scan_job)
    except ValueError:
        logger.warning(
            "triagem por IA pulada no scan %s - provider nao configurado", scan_job.id, exc_info=True
        )
        emit(db, scan_job.id, "triaging", "IA não configurada - achados ficam para revisão manual", EventKind.WARN)
        return

    db.expire_all()
    counts = _verdict_counts(db, scan_job)
    emit(db, scan_job.id, "triaging",
         f"IA confirmou {counts.get(AIVerdict.TRUE_POSITIVE, 0)}, descartou "
         f"{counts.get(AIVerdict.FALSE_POSITIVE, 0)} como alarme falso e deixou "
         f"{counts.get(AIVerdict.NEEDS_REVIEW, 0) + counts.get(AIVerdict.PENDING, 0)} para revisão",
         EventKind.FOUND)
    confirmed = db.scalars(
        select(Finding).where(Finding.scan_job_id == scan_job.id, Finding.ai_verdict == AIVerdict.TRUE_POSITIVE)
    ).all()
    emit_list(db, scan_job.id, "triaging", (
        f"Confirmado ({(f.ai_severity.value if f.ai_severity else 'sem severidade')}): {f.title}" for f in confirmed
    ), EventKind.ALERT, limit=15)

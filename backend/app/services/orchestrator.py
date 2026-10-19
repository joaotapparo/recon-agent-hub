"""
services/orchestrator.py - pipeline do scan (issues #7 e #20).

Coordena enum -> probe -> port_scan -> checking_takeover -> scanning_js ->
triaging pra um scan_job, atualizando o status no banco a cada etapa e
persistindo Subdomain/Finding/Report conforme os modulos retornam dados.
"""

import asyncio
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.subprocess_runner import ToolError
from app.database import SessionLocal
from app.models import Finding, FindingCategory, ScanJob, ScanStatus, Subdomain
from app.services import ai_triage, js_scanner
from app.services.recon.takeover_check import check_takeover
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

        scan_job.status = ScanStatus.ENUMERATING
        db.commit()
        hostnames = await run_subfinder(domain_name, scan_job_id)

        scan_job.status = ScanStatus.PROBING
        db.commit()
        probed = await run_httpx(hostnames, scan_job_id)
        probed_by_host = {(p.get("input") or p.get("host")): p for p in probed}

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

        scan_job.status = ScanStatus.PORT_SCANNING
        db.commit()
        targets = [s for s in subdomains if s.http_status is not None]
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

        scan_job.status = ScanStatus.CHECKING_TAKEOVER
        db.commit()
        for subdomain in subdomains:
            probe = probed_by_host.get(subdomain.hostname)
            takeover = check_takeover(subdomain.hostname, probe)
            subdomain.takeover_candidate = takeover["is_candidate"]
            subdomain.takeover_fingerprint = takeover["fingerprint"]
            if takeover["is_candidate"]:
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

        scan_job.status = ScanStatus.SCANNING_JS
        db.commit()
        live_hosts = [
            js_scanner.LiveHost(
                subdomain_id=s.id,
                hostname=s.hostname,
                url=probed_by_host[s.hostname].get("url") or f"https://{s.hostname}",
                body=probed_by_host[s.hostname].get("body"),
            )
            for s in targets
        ]
        await js_scanner.scan_hosts(db, scan_job, live_hosts)

        scan_job.status = ScanStatus.TRIAGING
        db.commit()
        await _triage(db, scan_job)
        await ai_triage.generate_report(db, scan_job)

        scan_job.status = ScanStatus.COMPLETED
        scan_job.finished_at = datetime.utcnow()
        db.commit()

    except Exception as exc:
        db.rollback()
        scan_job = db.get(ScanJob, scan_job_id)
        if scan_job is not None:
            scan_job.status = ScanStatus.FAILED
            scan_job.error_message = str(exc)
            scan_job.finished_at = datetime.utcnow()
            db.commit()
        raise
    finally:
        db.close()


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
    try:
        await ai_triage.triage_findings(db, scan_job)
    except ValueError:
        logger.warning(
            "triagem por IA pulada no scan %s - provider nao configurado", scan_job.id, exc_info=True
        )

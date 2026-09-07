"""
Servico de Infraestrutura (RF02, RF03, RF04).

Pipeline: subfinder (subdominios) -> httpx (hosts ativos) -> nmap (portas)
-> dnspython + fingerprints (risco de subdomain takeover).

Usado pelo worker do pipeline (app/workers/pipeline.py).
"""

import logging
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

from app.models import Finding, FindingCategory, ScanJob, ScanStatus, Subdomain
from app.tool_wrappers import check_takeover, run_httpx, run_nmap, run_subfinder

logger = logging.getLogger(__name__)

_NMAP_MAX_WORKERS = 5


def _scan_ports(hostname: str) -> list[dict]:
    """Roda o nmap pra um host, sem deixar a falha de UM host derrubar o scan inteiro."""
    try:
        return run_nmap(hostname)
    except RuntimeError:
        logger.warning("Falha ao escanear portas de %s", hostname, exc_info=True)
        return []


def run_recon(db: Session, scan_job: ScanJob) -> list[Subdomain]:
    """Executa o recon completo para `scan_job` e retorna os Subdomains criados."""
    domain_name = scan_job.domain.name

    scan_job.status = ScanStatus.ENUMERATING
    db.commit()
    hostnames = run_subfinder(domain_name)

    scan_job.status = ScanStatus.PROBING
    db.commit()
    probed = run_httpx(hostnames)
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
    with ThreadPoolExecutor(max_workers=_NMAP_MAX_WORKERS) as executor:
        port_results = list(executor.map(lambda s: _scan_ports(s.hostname), targets))

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
        takeover = check_takeover(subdomain.hostname)
        subdomain.takeover_candidate = takeover["is_candidate"]
        subdomain.takeover_fingerprint = takeover["fingerprint"]
        if takeover["is_candidate"]:
            db.add(Finding(
                scan_job_id=scan_job.id,
                domain_id=scan_job.domain_id,
                subdomain_id=subdomain.id,
                category=FindingCategory.SUBDOMAIN_TAKEOVER,
                source_tool="dnspython",
                title=f"Possivel subdomain takeover em {subdomain.hostname}",
                target=subdomain.hostname,
                raw_evidence={"cname": takeover["cname"], "fingerprint": takeover["fingerprint"]},
            ))
    db.commit()

    return subdomains

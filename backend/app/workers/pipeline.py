"""
Executa o pipeline completo de uma ScanJob: recon -> scan de codigo web ->
triagem por IA. Atualiza o status da ScanJob a cada etapa (ver ScanStatus
em app/models/scan_job.py) e marca FAILED com `error_message` em caso de
excecao em qualquer etapa.

Chamado via FastAPI BackgroundTasks a partir do router de scans (RF15 -
acompanhamento do status enquanto a analise roda em segundo plano). Se o
projeto crescer alem de `max_concurrent_scans: 1`, trocar por uma fila de
verdade (ver settings em app/config.py).
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ScanJob, ScanStatus
from app.services import ai_triage, js_scanner, recon


def run_scan_job(scan_job_id: int) -> None:
    db: Session = SessionLocal()
    try:
        scan_job = db.get(ScanJob, scan_job_id)
        if scan_job is None:
            return

        scan_job.started_at = datetime.utcnow()
        db.commit()

        subdomains = recon.run_recon(db, scan_job)
        live_hosts = [s.hostname for s in subdomains if s.http_status is not None]

        scan_job.status = ScanStatus.SCANNING_JS
        db.commit()
        js_scanner.scan_hosts(db, scan_job, live_hosts)

        scan_job.status = ScanStatus.TRIAGING
        db.commit()
        ai_triage.triage_findings(db, scan_job)

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

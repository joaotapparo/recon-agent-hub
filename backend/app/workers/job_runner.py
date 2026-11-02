"""
workers/job_runner.py - fila de jobs in-process, assincrona (issue #6 + #27).

Fila alimentada por POST /api/domains (e /rescan), consumida por uma unica
task de background iniciada no lifespan do FastAPI (app/main.py).
`settings.max_concurrent_scans` limita quantos scans rodam ao mesmo tempo -
hoje e 1, entao um unico worker loop sequencial ja cobre isso.
"""

import asyncio
import logging

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import ScanJob, ScanStatus
from app.services.orchestrator import run_scan_job

logger = logging.getLogger(__name__)

_queue: asyncio.Queue[int] = asyncio.Queue()
_semaphore = asyncio.Semaphore(settings.max_concurrent_scans)

_NON_TERMINAL_STATUSES = [s for s in ScanStatus if s not in (ScanStatus.COMPLETED, ScanStatus.FAILED)]


def enqueue(scan_job_id: int) -> None:
    _queue.put_nowait(scan_job_id)


async def _worker_loop() -> None:
    while True:
        scan_job_id = await _queue.get()
        async with _semaphore:
            try:
                await run_scan_job(scan_job_id)
            except Exception:
                logger.exception("Scan job %s falhou", scan_job_id)
            finally:
                _queue.task_done()


def start_worker() -> asyncio.Task:
    """Chamado no lifespan do FastAPI (app/main.py) - sobe a task de consumo da fila."""
    return asyncio.create_task(_worker_loop())


def recover_orphaned_jobs() -> None:
    """
    Issue #27 - ao iniciar o backend, scan_jobs presos num status
    intermediario (de um restart anterior, cujo processo nao existe mais)
    sao marcados como failed em vez de ficarem "rodando" pra sempre.
    """
    db = SessionLocal()
    try:
        orphaned = db.execute(
            select(ScanJob).where(ScanJob.status.in_(_NON_TERMINAL_STATUSES))
        ).scalars().all()

        for job in orphaned:
            job.status = ScanStatus.FAILED
            job.error_message = "Job interrompido por reinicio do backend"

        if orphaned:
            db.commit()
            logger.warning("%d scan_jobs orfaos marcados como failed no startup", len(orphaned))
    finally:
        db.close()

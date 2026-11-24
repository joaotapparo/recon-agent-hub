"""
services/scan_events.py - feed ao vivo do scan, lido pelo painel.

Os eventos narram o pipeline em linguagem simples ("Porta 443 aberta em
app.exemplo.com") pra quem acompanha a analise pela tela. Sao so narracao:
nada no pipeline le eventos de volta, e uma falha ao grava-los nao derruba
o scan.
"""

import logging
from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models import EventKind, ScanEvent

logger = logging.getLogger(__name__)

_MESSAGE_MAX = 500
# Limite por lista, pra um dominio com milhares de subdominios nao inundar o feed.
DEFAULT_LIST_LIMIT = 40


def emit(
    db: Session, scan_job_id: int, stage: str, message: str, kind: EventKind = EventKind.INFO
) -> None:
    try:
        db.add(ScanEvent(scan_job_id=scan_job_id, stage=stage, kind=kind, message=message[:_MESSAGE_MAX]))
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("falha ao gravar evento do scan %s", scan_job_id, exc_info=True)


def emit_list(
    db: Session,
    scan_job_id: int,
    stage: str,
    messages: Iterable[str],
    kind: EventKind = EventKind.FOUND,
    *,
    limit: int = DEFAULT_LIST_LIMIT,
) -> None:
    items = list(messages)
    try:
        for message in items[:limit]:
            db.add(ScanEvent(scan_job_id=scan_job_id, stage=stage, kind=kind, message=message[:_MESSAGE_MAX]))
        if len(items) > limit:
            db.add(ScanEvent(
                scan_job_id=scan_job_id,
                stage=stage,
                kind=EventKind.INFO,
                message=f"... e mais {len(items) - limit} itens",
            ))
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("falha ao gravar eventos do scan %s", scan_job_id, exc_info=True)

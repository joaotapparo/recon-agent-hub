"""routers/insights.py - dados extras do painel: globo dos servidores e cadeias de ataque."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ScanJob, ScanStatus, Subdomain
from app.services import geoip
from app.services.ai_triage import attack_chains

router = APIRouter(prefix="/api/scans", tags=["insights"])


def _scan(db: Session, scan_job_id: int) -> ScanJob:
    scan_job = db.get(ScanJob, scan_job_id)
    if scan_job is None:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return scan_job


def _hosts(db: Session, scan_job_id: int) -> list[tuple[str, list[str], bool]]:
    rows = db.query(Subdomain).filter(Subdomain.scan_job_id == scan_job_id).all()
    return [(s.hostname, list(s.ip_addresses or []), s.http_status is not None) for s in rows]


@router.get("/{scan_job_id}/geo")
async def get_scan_geo(scan_job_id: int, db: Session = Depends(get_db)):
    """Localização aproximada de cada IP público dos subdomínios do scan."""
    await asyncio.to_thread(_scan, db, scan_job_id)
    hosts = await asyncio.to_thread(_hosts, db, scan_job_id)
    points, origin = await asyncio.gather(
        geoip.locate([ip for _, ips, _ in hosts for ip in ips]), geoip.locate_self()
    )
    out = []
    for hostname, ips, active in hosts:
        for ip in ips:
            if point := points.get(ip):
                out.append(
                    {
                        "hostname": hostname,
                        "active": active,
                        "ip": ip,
                        "lat": point.lat,
                        "lon": point.lon,
                        "city": point.city,
                        "country": point.country,
                        "country_code": point.country_code,
                        "org": point.org,
                    }
                )
    # origem: de onde a analise partiu (o IP do proprio servidor nao vai ao painel)
    return {
        "origin": {"lat": origin.lat, "lon": origin.lon, "city": origin.city, "country": origin.country}
        if origin
        else None,
        "points": out,
    }


@router.get("/{scan_job_id}/attack-chains")
async def get_attack_chains(scan_job_id: int, db: Session = Depends(get_db)):
    """Cadeias geradas pela IA, se já existirem; senão as montadas por regra."""
    scan_job = await asyncio.to_thread(_scan, db, scan_job_id)
    try:
        return await attack_chains.current_chains(db, scan_job)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{scan_job_id}/attack-chains")
async def generate_attack_chains(scan_job_id: int, db: Session = Depends(get_db)):
    """Pede à IA para montar as cadeias. Sem IA disponível, devolve as de regra com aviso."""
    scan_job = await asyncio.to_thread(_scan, db, scan_job_id)
    if scan_job.status != ScanStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="A análise ainda não terminou")
    try:
        return await attack_chains.generate_ai_chains(db, scan_job)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

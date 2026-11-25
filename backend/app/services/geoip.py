"""
services/geoip.py - localizacao aproximada dos servidores de um scan (globo do painel).

So consulta IP publico (is_global), um por vez em servico gratuito via HTTPS:
ipwho.is e, se falhar, ipinfo.io. Respostas ficam em cache em data/geo_cache
por 30 dias, entao abrir o painel de novo nao repete a consulta. Falha aqui
nunca e erro do scan: o IP so fica fora do globo, com um warning no log.
"""

import asyncio
import ipaddress
import json
import logging
import time
from dataclasses import asdict, dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30 * 24 * 3600
_CONCURRENCY = 4


@dataclass(frozen=True)
class GeoPoint:
    ip: str
    lat: float
    lon: float
    city: str | None
    country: str | None
    country_code: str | None
    org: str | None


_self_cache: tuple[float, GeoPoint | None] | None = None


async def locate_self() -> GeoPoint | None:
    """Onde o proprio servidor de analise esta (origem dos arcos no globo). Cache de 1h."""
    global _self_cache
    if not settings.geoip_enabled:
        return None
    if _self_cache and time.time() - _self_cache[0] < 3600:
        return _self_cache[1]
    point = None
    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            resp = await client.get("https://ipwho.is/")
            resp.raise_for_status()
            ip = resp.json().get("ip")
            if ip:
                point = await _ipwho(client, ip)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.warning("geoip da origem falhou: %s", exc)
    _self_cache = (time.time(), point)
    return point


def is_public(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


async def locate(ips: list[str]) -> dict[str, GeoPoint]:
    """Geolocaliza os IPs publicos da lista; os que falharem ficam de fora."""
    unique = sorted({ip for ip in ips if is_public(ip)})
    if not unique or not settings.geoip_enabled:
        return {}
    sem = asyncio.Semaphore(_CONCURRENCY)
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:

        async def one(ip: str) -> tuple[str, GeoPoint | None]:
            async with sem:
                return ip, await _lookup(client, ip)

        results = await asyncio.gather(*(one(ip) for ip in unique))
    return {ip: point for ip, point in results if point is not None}


async def _lookup(client: httpx.AsyncClient, ip: str) -> GeoPoint | None:
    cached = await asyncio.to_thread(_read_cache, ip)
    if cached is not None:
        return cached
    for fetch in (_ipwho, _ipinfo):
        try:
            point = await fetch(client, ip)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("geoip %s falhou para %s: %s", fetch.__name__, ip, exc)
            continue
        if point is not None:
            await asyncio.to_thread(_write_cache, point)
            return point
    return None


async def _ipwho(client: httpx.AsyncClient, ip: str) -> GeoPoint | None:
    resp = await client.get(f"https://ipwho.is/{ip}")
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        return None
    conn = data.get("connection") or {}
    return GeoPoint(
        ip=ip,
        lat=float(data["latitude"]),
        lon=float(data["longitude"]),
        city=data.get("city"),
        country=data.get("country"),
        country_code=data.get("country_code"),
        org=conn.get("org") or conn.get("isp"),
    )


async def _ipinfo(client: httpx.AsyncClient, ip: str) -> GeoPoint | None:
    resp = await client.get(f"https://ipinfo.io/{ip}/json")
    resp.raise_for_status()
    data = resp.json()
    if "loc" not in data:
        return None
    lat, lon = (float(v) for v in data["loc"].split(","))
    org = data.get("org")
    # "AS63949 Akamai Connected Cloud" -> "Akamai Connected Cloud"
    if org and org.startswith("AS") and " " in org:
        org = org.split(" ", 1)[1]
    return GeoPoint(
        ip=ip,
        lat=lat,
        lon=lon,
        city=data.get("city"),
        country=data.get("country"),
        country_code=data.get("country"),
        org=org,
    )


def _cache_file(ip: str):
    return settings.data_dir / "geo_cache" / f"{ip.replace(':', '_')}.json"


def _read_cache(ip: str) -> GeoPoint | None:
    path = _cache_file(ip)
    try:
        if time.time() - path.stat().st_mtime > CACHE_TTL_SECONDS:
            return None
        return GeoPoint(**json.loads(path.read_text()))
    except (OSError, ValueError, TypeError):
        return None


def _write_cache(point: GeoPoint) -> None:
    path = _cache_file(point.ip)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(point)))
    except OSError as exc:
        logger.warning("nao foi possivel gravar cache de geoip: %s", exc)

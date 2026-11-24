"""
Versoes de software expostas -> falhas publicas conhecidas (CVE), via NVD.

Fontes da versao: cabecalhos `Server`/`X-Powered-By` (ex.: "Apache/2.4.7")
e a deteccao de tecnologia do httpx (ex.: "PHP:5.6.40"). Cada componente
vira um CPE e e consultado na API publica do NVD
(services.nvd.nist.gov, sem chave: 5 consultas a cada 30s; com
NVD_API_KEY: 50). Respostas ficam em cache em data/cve_cache por 7 dias.

E INDICATIVO, nao prova: distribuicoes como Ubuntu/Debian/RHEL corrigem
falhas sem mudar o numero da versao (backport), e o cabecalho pode mentir.
A evidencia leva esse aviso pra IA e pro relatorio. Nenhum contato com o
alvo alem do que a auditoria web ja fez.
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
_CACHE_TTL_SECONDS = 7 * 24 * 3600
_DELAY_WITHOUT_KEY = 6.5  # 5 req/30s
_DELAY_WITH_KEY = 0.7  # 50 req/30s
_TOP_CVES = 8

# nome normalizado -> (nome de exibicao, vendor CPE, product CPE)
PRODUCTS: dict[str, tuple[str, str, str]] = {
    "apache": ("Apache HTTP Server", "apache", "http_server"),
    "apache http server": ("Apache HTTP Server", "apache", "http_server"),
    "nginx": ("nginx", "f5", "nginx"),
    "php": ("PHP", "php", "php"),
    "openssl": ("OpenSSL", "openssl", "openssl"),
    "microsoft-iis": ("Microsoft IIS", "microsoft", "internet_information_services"),
    "iis": ("Microsoft IIS", "microsoft", "internet_information_services"),
    "lighttpd": ("lighttpd", "lighttpd", "lighttpd"),
    "apache tomcat": ("Apache Tomcat", "apache", "tomcat"),
    "jquery": ("jQuery", "jquery", "jquery"),
    "wordpress": ("WordPress", "wordpress", "wordpress"),
    "drupal": ("Drupal", "drupal", "drupal"),
    "bootstrap": ("Bootstrap", "getbootstrap", "bootstrap"),
}

_VERSION = re.compile(r"^\d+(?:\.\d+){1,3}[a-z]?$")
_HEADER_TOKEN = re.compile(r"([A-Za-z][\w-]*)/(\d+(?:\.\d+){1,3}[a-z]?)")
_BACKPORT_HINT = re.compile(r"ubuntu|debian|red ?hat|centos|el\d|amzn|suse", re.IGNORECASE)


@dataclass
class Component:
    name: str
    vendor: str
    product: str
    version: str
    hosts: list[str] = field(default_factory=list)
    backport_possible: bool = False

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.vendor, self.product, self.version)

    @property
    def cpe(self) -> str:
        return f"cpe:2.3:a:{self.vendor}:{self.product}:{self.version}:*:*:*:*:*:*:*"


def components_from(host: str, headers: dict[str, str], tech: list[str] | None) -> list[Component]:
    """Componentes com versao exata identificados num host (sem duplicar)."""
    found: dict[tuple[str, str, str], Component] = {}
    raw_headers = " ".join(headers.get(h, "") for h in ("server", "x-powered-by"))
    backport = bool(_BACKPORT_HINT.search(raw_headers)) or any(
        _BACKPORT_HINT.search(t) for t in tech or []
    )

    candidates = [(m.group(1), m.group(2)) for m in _HEADER_TOKEN.finditer(raw_headers)]
    candidates += [tuple(t.rsplit(":", 1)) for t in tech or [] if ":" in t]

    for name, version in candidates:
        info = PRODUCTS.get(name.strip().lower())
        version = version.strip()
        if not info or not _VERSION.match(version):
            continue
        comp = Component(name=info[0], vendor=info[1], product=info[2], version=version,
                         hosts=[host], backport_possible=backport)
        found.setdefault(comp.key, comp)
    return list(found.values())


def merge(components: list[Component]) -> list[Component]:
    merged: dict[tuple[str, str, str], Component] = {}
    for comp in components:
        if comp.key in merged:
            target = merged[comp.key]
            target.hosts += [h for h in comp.hosts if h not in target.hosts]
            target.backport_possible |= comp.backport_possible
        else:
            merged[comp.key] = comp
    return list(merged.values())


def summarize(component: Component, nvd: dict) -> dict:
    """Resumo enxuto para evidencia (o JSON do NVD tem ~1 MB para um Apache antigo)."""
    cves = []
    for item in nvd.get("vulnerabilities", []):
        cve = item.get("cve", {})
        score, severity = _cvss(cve.get("metrics", {}))
        description = next(
            (d["value"] for d in cve.get("descriptions", []) if d.get("lang") == "en"), ""
        )
        cves.append({
            "id": cve.get("id"),
            "score": score,
            "severity": severity,
            "known_exploited": "cisaExploitAdd" in cve,
            "summary": description[:220],
        })
    cves.sort(key=lambda c: (c["known_exploited"], c["score"] or 0), reverse=True)

    by_severity: dict[str, int] = {}
    for c in cves:
        by_severity[c["severity"] or "UNKNOWN"] = by_severity.get(c["severity"] or "UNKNOWN", 0) + 1

    return {
        "component": component.name,
        "version": component.version,
        "cpe": component.cpe,
        "hosts": component.hosts,
        "total_cves": len(cves),
        "by_severity": by_severity,
        "known_exploited": [c["id"] for c in cves if c["known_exploited"]],
        "top_cves": cves[:_TOP_CVES],
        "source": "NVD (nvd.nist.gov)",
        "caveat": (
            "Versão informada pelo próprio servidor. "
            + ("A distribuição (ex.: Ubuntu/Debian) pode ter corrigido falhas sem mudar o número da versão. "
               if component.backport_possible else "")
            + "Confirme a versão real instalada antes de concluir que as falhas se aplicam."
        ),
    }


def _cvss(metrics: dict) -> tuple[float | None, str | None]:
    for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = metrics.get(key) or []
        if entries:
            data = entries[0]
            cvss = data.get("cvssData", {})
            return cvss.get("baseScore"), cvss.get("baseSeverity") or data.get("baseSeverity")
    return None, None


class NvdClient:
    """Consulta o NVD respeitando o limite de taxa, com cache em disco."""

    def __init__(self) -> None:
        self._last_call = 0.0
        self._cache_dir = settings.data_dir / "cve_cache"

    async def lookup(self, component: Component) -> dict | None:
        cached = await asyncio.to_thread(self._read_cache, component)
        if cached is not None:
            return cached
        delay = _DELAY_WITH_KEY if settings.nvd_api_key else _DELAY_WITHOUT_KEY
        wait = self._last_call + delay - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_call = time.monotonic()

        headers = {"apiKey": settings.nvd_api_key} if settings.nvd_api_key else {}
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.get(NVD_URL, params={"cpeName": component.cpe}, headers=headers)
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("consulta ao NVD falhou para %s: %s", component.cpe, exc)
            return None
        await asyncio.to_thread(self._write_cache, component, data)
        return data

    def _cache_file(self, component: Component):
        safe = re.sub(r"[^a-z0-9._-]", "_", "_".join(component.key).lower())
        return self._cache_dir / f"{safe}.json"

    def _read_cache(self, component: Component) -> dict | None:
        path = self._cache_file(component)
        try:
            if time.time() - path.stat().st_mtime < _CACHE_TTL_SECONDS:
                return json.loads(path.read_text())
        except (OSError, ValueError):
            pass
        return None

    def _write_cache(self, component: Component, data: dict) -> None:
        try:
            self._cache_dir.mkdir(parents=True, exist_ok=True)
            self._cache_file(component).write_text(json.dumps(data))
        except OSError as exc:
            logger.warning("nao foi possivel gravar cache do NVD: %s", exc)

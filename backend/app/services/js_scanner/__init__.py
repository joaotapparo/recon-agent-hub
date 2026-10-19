"""
Servico Codigo Web (RF05-RF09, issues #11-#14 e #31).

Chamado pelo orchestrator depois do recon, com os hosts que o httpx
encontrou ativos. Para cada host:

1. descobre os `<script src>` do HTML ja capturado pelo httpx (discovery.py);
2. baixa os JS do proprio dominio, com dedup por SHA-256 (downloader.py);
3. extrai endpoints/rotas escondidas (endpoint_extractor.py);
4. procura candidatos a secret via gitleaks/regex (secret_scanner.py);
5. testa arquivos sensiveis conhecidos (sensitive_files.py).

Secrets e endpoints ficam `ai_verdict=PENDING` pra triagem da IA. Arquivo
sensivel exposto ja nasce critico e confirmado (RF09).
"""

import logging
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIVerdict, Finding, FindingCategory, ScanJob, Severity
from app.services.js_scanner.discovery import discover_js_urls, is_in_scope
from app.services.js_scanner.downloader import (
    HostGuard,
    JsFile,
    build_client,
    download_js_files,
    fetch_limited,
)
from app.services.js_scanner.endpoint_extractor import extract_endpoints
from app.services.js_scanner.secret_scanner import find_secrets
from app.services.js_scanner.sensitive_files import ExposedFile, check_sensitive_files

logger = logging.getLogger(__name__)

__all__ = ["LiveHost", "scan_hosts"]

_TARGET_MAX = 512


@dataclass(frozen=True)
class LiveHost:
    subdomain_id: int | None
    hostname: str
    url: str  # URL final que o httpx sondou, ex.: https://app.exemplo.com
    body: str | None = None  # HTML capturado pelo httpx (-include-response)


async def scan_hosts(db: Session, scan_job: ScanJob, live_hosts: list[LiveHost]) -> None:
    if not live_hosts:
        return
    domain_name = scan_job.domain.name
    guard = HostGuard()

    async with build_client() as client:
        js_owner: dict[str, LiveHost] = {}
        for host in live_hosts:
            body = host.body
            if body is None:
                page = await fetch_limited(client, guard, host.url, max_bytes=settings.js_max_file_bytes)
                body = page.content.decode(errors="replace") if page else None
            for url in discover_js_urls(host.url, body):
                if is_in_scope(url, domain_name):
                    js_owner.setdefault(url, host)

        urls = list(js_owner)[: settings.max_js_files_per_scan]
        if len(js_owner) > len(urls):
            logger.warning(
                "scan %s: %d JS descobertos, analisando so os primeiros %d",
                scan_job.id, len(js_owner), len(urls),
            )
        js_files = await download_js_files(client, guard, urls, scan_job.id)
        logger.info("scan %s: %d JS unicos baixados de %d URLs", scan_job.id, len(js_files), len(urls))

        for js in js_files:
            endpoints = extract_endpoints(js.content)
            if endpoints:
                db.add(_endpoint_finding(scan_job, js_owner[js.url], js, endpoints))

        for candidate in await find_secrets(js_files, scan_job.id):
            owner = js_owner[candidate.file.url]
            db.add(Finding(
                scan_job_id=scan_job.id,
                domain_id=scan_job.domain_id,
                subdomain_id=owner.subdomain_id,
                category=FindingCategory.EXPOSED_SECRET,
                source_tool=candidate.detector,
                title=f"Possivel secret ({candidate.rule}) em {_file_name(js_url=candidate.file.url)}",
                target=candidate.file.url[:_TARGET_MAX],
                raw_evidence=candidate.evidence(),
                ai_verdict=AIVerdict.PENDING,
            ))
        db.commit()

        for host in live_hosts:
            for exposed in await check_sensitive_files(client, guard, _origin(host.url)):
                db.add(_exposed_file_finding(scan_job, host, exposed))
        db.commit()


def _endpoint_finding(scan_job: ScanJob, host: LiveHost, js: JsFile, endpoints: list[str]) -> Finding:
    return Finding(
        scan_job_id=scan_job.id,
        domain_id=scan_job.domain_id,
        subdomain_id=host.subdomain_id,
        category=FindingCategory.EXPOSED_ENDPOINT,
        source_tool="endpoint-regex",
        title=f"{len(endpoints)} endpoint(s) extraido(s) de {_file_name(js_url=js.url)}",
        target=js.url[:_TARGET_MAX],
        raw_evidence={"js_url": js.url, "js_sha256": js.sha256, "endpoints": endpoints},
        ai_verdict=AIVerdict.PENDING,
    )


def _exposed_file_finding(scan_job: ScanJob, host: LiveHost, exposed: ExposedFile) -> Finding:
    # RF09: a exposicao em si ja e a falha - confirmado e critico sem passar pela IA
    return Finding(
        scan_job_id=scan_job.id,
        domain_id=scan_job.domain_id,
        subdomain_id=host.subdomain_id,
        category=FindingCategory.MISCONFIGURATION,
        source_tool="sensitive-files",
        title=f"Arquivo sensivel exposto: {exposed.path} em {host.hostname}",
        target=exposed.url[:_TARGET_MAX],
        raw_evidence=exposed.evidence(),
        ai_verdict=AIVerdict.TRUE_POSITIVE,
        ai_severity=Severity.CRITICAL,
        ai_confidence=1.0,
        ai_reasoning=(
            f"{exposed.description} acessivel publicamente (HTTP {exposed.status_code}) e com "
            "conteudo compativel com o arquivo esperado. A exposicao por si so configura a falha (RF09)."
        ),
        ai_reproduction_steps=f"curl -i {exposed.url}",
        ai_remediation=(
            "Bloquear o acesso ao arquivo no servidor web, remove-lo do diretorio publicado "
            "e rotacionar qualquer credencial que ele contenha."
        ),
    )


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def _file_name(*, js_url: str) -> str:
    return PurePosixPath(urlsplit(js_url).path).name or js_url

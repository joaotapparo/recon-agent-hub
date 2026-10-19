"""
js_scanner/downloader.py - download de arquivos JS com dedup (RF05, issue #12).

Cliente HTTP assincrono (pacote `httpx`, ja dependencia do projeto) com cap
de tamanho, timeout e deduplicacao por SHA-256 - bundles compartilhados
entre subdominios sao baixados/analisados uma vez so.

Redirecionamento NAO e seguido e todo host passa pelo `ssrf_guard` antes do
request: um `<script src>` (ou um 302) apontando pra IP interno nao pode
transformar o backend em proxy pra rede da instancia (ver issue #26).
"""

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from app.config import settings
from app.core.ssrf_guard import UnsafeDomainError, assert_domain_is_public

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FetchResult:
    url: str
    status_code: int
    content_type: str
    content: bytes


@dataclass(frozen=True)
class JsFile:
    url: str
    sha256: str
    path: Path
    content: str


def build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        follow_redirects=False,
        timeout=settings.http_timeout_seconds,
        headers={"User-Agent": "recon-agent-hub/0.1 (scan autorizado)"},
        verify=False,  # muito subdominio de teste/staging tem certificado invalido
    )


class HostGuard:
    """Cacheia o resultado do ssrf_guard por host - evita resolver DNS a cada URL."""

    def __init__(self) -> None:
        self._cache: dict[str, bool] = {}

    async def is_public(self, url: str) -> bool:
        host = urlsplit(url).hostname
        if not host:
            return False
        if host not in self._cache:
            try:
                await asyncio.to_thread(assert_domain_is_public, host)
                self._cache[host] = True
            except UnsafeDomainError as exc:
                logger.warning("host %s ignorado pelo ssrf_guard: %s", host, exc)
                self._cache[host] = False
        return self._cache[host]


async def fetch_limited(
    client: httpx.AsyncClient, guard: HostGuard, url: str, *, max_bytes: int, truncate: bool = False
) -> FetchResult | None:
    """
    GET com cap de tamanho. Retorna None se o host for bloqueado ou a rede
    falhar. Passando do cap: descarta a resposta, ou com `truncate=True`
    devolve so os primeiros `max_bytes`.
    """
    if not await guard.is_public(url):
        return None
    try:
        async with client.stream("GET", url) as response:
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    if truncate:
                        chunks.append(chunk[: max_bytes - (size - len(chunk))])
                        break
                    logger.warning("%s passou do limite de %d bytes - ignorado", url, max_bytes)
                    return None
                chunks.append(chunk)
            return FetchResult(
                url=url,
                status_code=response.status_code,
                content_type=response.headers.get("content-type", ""),
                content=b"".join(chunks),
            )
    except httpx.HTTPError as exc:
        logger.warning("falha ao baixar %s: %s", url, exc)
        return None


async def download_js_files(
    client: httpx.AsyncClient, guard: HostGuard, urls: list[str], scan_job_id: int
) -> list[JsFile]:
    """Baixa os JS (status 200), salva em data/scans/{id}/js/{sha256}.js e descarta repetidos."""
    js_dir = settings.scans_dir / str(scan_job_id) / "js"
    await asyncio.to_thread(js_dir.mkdir, parents=True, exist_ok=True)

    results = await asyncio.gather(
        *[fetch_limited(client, guard, url, max_bytes=settings.js_max_file_bytes) for url in urls]
    )

    files: list[JsFile] = []
    seen: set[str] = set()
    for result in results:
        if result is None or result.status_code != 200 or not result.content:
            continue
        sha256 = hashlib.sha256(result.content).hexdigest()
        if sha256 in seen:
            continue
        seen.add(sha256)
        path = js_dir / f"{sha256}.js"
        await asyncio.to_thread(path.write_bytes, result.content)
        files.append(JsFile(
            url=result.url,
            sha256=sha256,
            path=path,
            content=result.content.decode(errors="replace"),
        ))
    return files

"""
services/screenshots.py - print da pagina inicial de cada site ativo.

Usa o Chromium headless do Playwright (dependencia OPCIONAL:
`uv sync --extra screenshots` + `uv run playwright install chromium`). Sem
ele, a etapa e pulada com um aviso no feed; o scan nao falha.

Seguranca: um navegador segue redirecionamento e carrega recursos de
qualquer origem. Sem controle, um site poderia redirecionar o navegador
para um endereco interno (ex.: 169.254.169.254, metadata da AWS) e o print
vazaria o conteudo. Por isso:

- TODA requisicao do navegador e interceptada e feita por nos
  (`route.fetch`), com o host validado pelo HostGuard (ssrf_guard);
- redirecionamento NUNCA e entregue ao navegador: testado na pratica, o
  Chromium segue um 3xx sem passar de novo pelo interceptador (com
  `continue_()` ou com `fulfill` do 3xx), e o destino interno vazava. Aqui
  seguimos a cadeia salto a salto, validando cada destino, e entregamos so a
  resposta final (tests/test_screenshots.py cobre esse caso);
- WebSocket e service worker sao bloqueados; esquemas fora de http/https
  tambem (data:/blob: passam, nao tocam a rede).

DNS rebinding continua fora do escopo (issue #26), como no resto do projeto.

Os prints ficam em data/scans/{scan_id}/screenshots/{hostname}.jpg.
"""

import asyncio
import logging
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from sqlalchemy.orm import Session

from app.config import settings
from app.models import EventKind, ScanJob
from app.services.js_scanner import LiveHost
from app.services.js_scanner.discovery import is_in_scope
from app.services.js_scanner.downloader import HostGuard
from app.services.scan_events import emit

logger = logging.getLogger(__name__)

STAGE = "web_audit"
MAX_SITES = 20
_PARALLEL_PAGES = 3
_NAV_TIMEOUT_MS = 15_000
_SETTLE_MS = 1_200
_VALID_HOSTNAME = re.compile(r"^[a-z0-9.-]{1,253}$")
_MAX_REDIRECTS = 5


def screenshot_dir(scan_job_id: int) -> Path:
    return settings.scans_dir / str(scan_job_id) / "screenshots"


def screenshot_path(scan_job_id: int, hostname: str) -> Path | None:
    """Caminho do print, ou None se o hostname nao for um nome de host valido (evita path traversal)."""
    hostname = hostname.lower()
    if not _VALID_HOSTNAME.match(hostname) or ".." in hostname:
        return None
    return screenshot_dir(scan_job_id) / f"{hostname}.jpg"


def list_screenshots(scan_job_id: int) -> list[str]:
    folder = screenshot_dir(scan_job_id)
    if not folder.is_dir():
        return []
    return sorted(p.stem for p in folder.glob("*.jpg"))


async def capture_sites(db: Session, scan_job: ScanJob, live_hosts: list[LiveHost]) -> None:
    hosts = [h for h in live_hosts if is_in_scope(h.url, scan_job.domain.name)][:MAX_SITES]
    if not hosts:
        return
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        emit(db, scan_job.id, STAGE, "Prints dos sites indisponíveis (Playwright não instalado)", EventKind.WARN)
        return

    emit(db, scan_job.id, STAGE, f"Tirando foto da página inicial de {len(hosts)} site(s)")
    screenshot_dir(scan_job.id).mkdir(parents=True, exist_ok=True)
    guard = HostGuard()
    semaphore = asyncio.Semaphore(_PARALLEL_PAGES)

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch()
            try:
                async def shoot(host: LiveHost) -> tuple[LiveHost, bool]:
                    async with semaphore:
                        return host, await _capture(browser, guard, scan_job.id, host)

                for coro in asyncio.as_completed([shoot(h) for h in hosts]):
                    host, ok = await coro
                    if ok:
                        emit(db, scan_job.id, STAGE, f"Foto capturada: {host.hostname}", EventKind.FOUND)
            finally:
                await browser.close()
    except Exception as exc:  # noqa: BLE001 - recurso opcional: navegador ausente/quebrado nao derruba o scan
        logger.warning("prints do scan %s indisponiveis: %s", scan_job.id, exc)
        emit(db, scan_job.id, STAGE, "Prints dos sites indisponíveis (navegador não iniciou)", EventKind.WARN)


async def _capture(browser, guard: HostGuard, scan_job_id: int, host: LiveHost) -> bool:
    target = screenshot_path(scan_job_id, host.hostname)
    if target is None or not await guard.is_public(host.url):
        return False

    context = await browser.new_context(
        viewport={"width": 1280, "height": 800},
        ignore_https_errors=True,  # mesmo motivo do build_client: staging com certificado invalido
        user_agent="recon-agent-hub/0.1 (scan autorizado)",
        accept_downloads=False,
        service_workers="block",
    )
    try:
        await context.route("**/*", lambda route: _guarded(route, guard))
        # handler que nao chama connect_to_server: o WebSocket nunca sai para a rede
        await context.route_web_socket(re.compile(".*"), lambda ws: None)
        page = await context.new_page()
        await page.goto(host.url, timeout=_NAV_TIMEOUT_MS, wait_until="load")
        await page.wait_for_timeout(_SETTLE_MS)
        await page.screenshot(path=str(target), type="jpeg", quality=70)
        return True
    except Exception as exc:  # noqa: BLE001 - site lento/quebrado so perde o print
        logger.warning("falha no print de %s: %s", host.url, exc)
        return False
    finally:
        await context.close()


async def _guarded(route, guard: HostGuard) -> None:
    url = route.request.url
    if urlsplit(url).scheme in ("data", "blob"):
        await route.continue_()  # conteudo embutido na propria pagina, sem rede
        return
    try:
        for _ in range(_MAX_REDIRECTS + 1):
            if urlsplit(url).scheme not in ("http", "https") or not await guard.is_public(url):
                break
            response = await route.fetch(url=url, max_redirects=0)
            location = response.headers.get("location")
            if 300 <= response.status < 400 and location:
                url = urljoin(url, location)  # proximo salto: validado na volta do loop
                continue
            await route.fulfill(response=response)
            return
    except Exception as exc:  # noqa: BLE001 - na duvida, bloqueia a requisicao
        logger.debug("requisicao do print falhou (%s): %s", url, exc)
    await route.abort("blockedbyclient")

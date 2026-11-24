"""Prints dos sites: protecao anti-SSRF do navegador e endpoints."""

import asyncio
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services import screenshots


class OnlyLocalhostGuard:
    """'localhost' faz papel de site publico; '127.0.0.1' de endereco interno."""

    async def is_public(self, url: str) -> bool:
        return urlsplit(url).hostname == "localhost"


@pytest.fixture
def redirect_server():
    hits: list[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 - nome exigido pelo http.server
            hits.append(f"{self.headers.get('Host')}{self.path}")
            if self.path == "/to-internal":
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{port}/secret")
            elif self.path == "/to-public":
                self.send_response(302)
                self.send_header("Location", f"http://localhost:{port}/ok")
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
            self.end_headers()
            if self.path in ("/ok", "/secret"):
                self.wfile.write(b"<h1>pagina</h1>")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield port, hits
    server.shutdown()


async def _visit(url: str):
    playwright = pytest.importorskip("playwright.async_api")
    async with playwright.async_playwright() as pw:
        try:
            browser = await pw.chromium.launch()
        except Exception as exc:  # noqa: BLE001 - navegador nao instalado
            pytest.skip(f"Chromium indisponivel: {exc}")
        context = await browser.new_context()
        guard = OnlyLocalhostGuard()
        await context.route("**/*", lambda route: screenshots._guarded(route, guard))
        page = await context.new_page()
        try:
            response = await page.goto(url, timeout=8000)
            return response.status if response else None
        except Exception:  # noqa: BLE001 - navegacao bloqueada e o resultado esperado
            return None
        finally:
            await browser.close()


def test_redirect_to_internal_address_is_never_requested(redirect_server):
    port, hits = redirect_server
    status = asyncio.run(_visit(f"http://localhost:{port}/to-internal"))
    assert status is None
    assert not any(h.endswith("/secret") for h in hits), hits


def test_redirect_between_public_hosts_still_works(redirect_server):
    port, hits = redirect_server
    status = asyncio.run(_visit(f"http://localhost:{port}/to-public"))
    assert status == 200
    assert any(h.endswith("/ok") for h in hits)


@pytest.mark.parametrize("name", ["../etc/passwd", "a/b", "UPPER..x", "x" * 300, ""])
def test_screenshot_path_rejects_unsafe_names(name):
    assert screenshots.screenshot_path(1, name) is None


def test_screenshot_endpoints(tmp_path, monkeypatch):
    from app.database import get_db
    from app.main import app

    monkeypatch.setattr(settings, "scans_dir", tmp_path)
    folder = tmp_path / "7" / "screenshots"
    folder.mkdir(parents=True)
    (folder / "app.example.com.jpg").write_bytes(b"\xff\xd8jpeg")

    class FakeDB:
        def get(self, model, pk):
            return object() if pk == 7 else None

    app.dependency_overrides[get_db] = lambda: FakeDB()
    try:
        client = TestClient(app)
        assert client.get("/api/scans/7/screenshots").json() == ["app.example.com"]
        img = client.get("/api/scans/7/screenshots/app.example.com.jpg")
        assert img.status_code == 200
        assert img.headers["content-type"] == "image/jpeg"
        assert client.get("/api/scans/7/screenshots/outro.com.jpg").status_code == 404
        assert client.get("/api/scans/7/screenshots/..%2F..%2Fsegredo.jpg").status_code == 404
        assert client.get("/api/scans/8/screenshots").status_code == 404
    finally:
        app.dependency_overrides.clear()

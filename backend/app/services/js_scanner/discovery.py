"""
js_scanner/discovery.py - descoberta de URLs de arquivos JS (RF05, issue #11).

Extrai os `<script src>` do corpo HTML que o httpx ja capturou
(`-include-response`, campo `body`) - nao faz request nenhum aqui.
`katana` pra JS carregado dinamicamente fica como opcao futura.
"""

from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit


class _ScriptSrcParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "script":
            return
        src = dict(attrs).get("src")
        if src and src.strip():
            self.sources.append(src.strip())


def discover_js_urls(page_url: str, html: str | None) -> list[str]:
    """URLs absolutas (http/https) dos scripts externos da pagina, sem repetir."""
    if not html:
        return []

    parser = _ScriptSrcParser()
    parser.feed(html)

    urls: list[str] = []
    for src in parser.sources:
        url = urljoin(page_url, src).split("#", 1)[0]
        if urlsplit(url).scheme in ("http", "https") and url not in urls:
            urls.append(url)
    return urls


def is_in_scope(url: str, domain: str) -> bool:
    """
    So baixamos JS de hosts do proprio dominio autorizado. Script de CDN de
    terceiro (jquery, analytics) nao esta no escopo da autorizacao e so gera
    ruido pra triagem.
    """
    host = (urlsplit(url).hostname or "").lower()
    domain = domain.lower()
    return host == domain or host.endswith("." + domain)

"""
js_scanner/endpoint_extractor.py - extracao de endpoints escondidos (RF06, issue #14).

Regex inspirada no LinkFinder: strings com URL absoluta ou path relativo,
mais chamadas `fetch`/`axios`/`XMLHttpRequest.open`. Ruido esperado (assets,
paths genericos) e filtrado aqui so no obvio - o resto fica pra triagem da IA.
"""

import re

_QUOTED_PATH = re.compile(
    r"""["'`]"""
    r"""("""
    r"""https?://[^\s"'`<>]{4,}"""  # URL absoluta
    r"""|/(?:api|v\d+|graphql|rest|admin|internal|auth|oauth|private|debug|users?)\b[^\s"'`<>]*"""  # path relativo "interessante"
    r"""|(?:\.{0,2}/)?[a-zA-Z0-9_\-]+/[a-zA-Z0-9_\-/.]+\.(?:php|aspx?|jsp|json|action|do|cgi)(?:\?[^\s"'`<>]*)?"""  # arquivo server-side
    r""")"""
    r"""["'`]"""
)

_HTTP_CALL = re.compile(
    r"""(?:fetch|axios(?:\.(?:get|post|put|patch|delete|request))?|\.open)\s*\(\s*"""
    r"""(?:["'](?:GET|POST|PUT|PATCH|DELETE)["']\s*,\s*)?"""
    r"""["'`]([^"'`\s]{2,})["'`]""",
    re.IGNORECASE,
)

_IGNORED_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".css", ".woff", ".woff2",
    ".ttf", ".eot", ".map", ".mp4", ".mp3",
)
_IGNORED_HOSTS = ("www.w3.org", "schemas.xmlsoap.org", "reactjs.org", "github.com/facebook")

MAX_ENDPOINTS_PER_FILE = 200


def extract_endpoints(js: str) -> list[str]:
    found: list[str] = []
    for pattern in (_HTTP_CALL, _QUOTED_PATH):
        for match in pattern.finditer(js):
            endpoint = match.group(1).strip()
            if _is_noise(endpoint) or endpoint in found:
                continue
            found.append(endpoint)
            if len(found) >= MAX_ENDPOINTS_PER_FILE:
                return found
    return found


def _is_noise(endpoint: str) -> bool:
    path = endpoint.split("?", 1)[0].lower()
    if path.endswith(_IGNORED_SUFFIXES):
        return True
    if any(host in endpoint for host in _IGNORED_HOSTS):
        return True
    # template literal sem nada fixo, ex.: `${base}/${id}`
    return endpoint.startswith("${") or endpoint.count("/") == 0

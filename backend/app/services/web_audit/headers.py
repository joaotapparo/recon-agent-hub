"""
Cabecalhos HTTP de seguranca, vazamento de versao e flags de cookie.

Uma unica requisicao GET por host, lendo so os cabecalhos (o corpo nao e
baixado). A analise e uma funcao pura, testavel sem rede.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field

# cabecalho -> (nome curto, o que ele protege)
SECURITY_HEADERS: dict[str, tuple[str, str]] = {
    "strict-transport-security": ("HSTS", "obriga o navegador a usar sempre HTTPS"),
    "content-security-policy": ("CSP", "limita de onde scripts podem ser carregados (mitiga XSS)"),
    "x-frame-options": ("X-Frame-Options", "impede que o site seja embutido em outra pagina (clickjacking)"),
    "x-content-type-options": ("X-Content-Type-Options", "impede o navegador de adivinhar o tipo do arquivo"),
    "referrer-policy": ("Referrer-Policy", "controla quais URLs vazam para outros sites"),
    "permissions-policy": ("Permissions-Policy", "restringe camera, microfone e outras APIs do navegador"),
}

# cabecalhos que costumam entregar produto/versao do servidor
DISCLOSURE_HEADERS = ("server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version", "x-generator")
_HAS_VERSION = re.compile(r"\d+\.\d+")


@dataclass
class HeaderReport:
    url: str
    status_code: int
    missing: list[str] = field(default_factory=list)
    disclosed: dict[str, str] = field(default_factory=dict)
    insecure_cookies: list[dict] = field(default_factory=list)

    def missing_evidence(self) -> dict:
        return {
            "url": self.url,
            "status_code": self.status_code,
            "missing_headers": [
                {"header": h, "name": SECURITY_HEADERS[h][0], "purpose": SECURITY_HEADERS[h][1]}
                for h in self.missing
            ],
            "insecure_cookies": self.insecure_cookies,
        }

    def disclosure_evidence(self) -> dict:
        return {"url": self.url, "status_code": self.status_code, "disclosed_headers": self.disclosed}


def analyze_headers(url: str, status_code: int, headers: Mapping[str, str], set_cookies: list[str]) -> HeaderReport:
    lower = {k.lower(): v for k, v in headers.items()}
    report = HeaderReport(url=url, status_code=status_code)
    is_https = url.lower().startswith("https://")

    for header in SECURITY_HEADERS:
        if header in lower:
            continue
        if header == "strict-transport-security" and not is_https:
            continue  # HSTS so vale em resposta HTTPS
        if header == "x-frame-options" and "frame-ancestors" in lower.get("content-security-policy", ""):
            continue  # CSP frame-ancestors substitui o X-Frame-Options
        report.missing.append(header)

    for header in DISCLOSURE_HEADERS:
        value = lower.get(header, "").strip()
        # "Server: nginx" sozinho e inofensivo; o problema e a versao exata
        if value and (header != "server" or _HAS_VERSION.search(value)):
            report.disclosed[header] = value[:120]

    for raw in set_cookies:
        cookie = _cookie_flags(raw, is_https)
        if cookie:
            report.insecure_cookies.append(cookie)
    return report


def _cookie_flags(raw: str, is_https: bool) -> dict | None:
    """So o nome do cookie vai pra evidencia - o valor pode ser sessao de alguem."""
    name = raw.split("=", 1)[0].strip()
    attrs = {part.split("=", 1)[0].strip().lower() for part in raw.split(";")[1:]}
    missing = []
    if is_https and "secure" not in attrs:
        missing.append("Secure")
    if "httponly" not in attrs:
        missing.append("HttpOnly")
    if "samesite" not in attrs:
        missing.append("SameSite")
    return {"cookie": name[:80], "missing_flags": missing} if missing else None

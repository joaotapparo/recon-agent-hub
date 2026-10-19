"""
js_scanner/sensitive_files.py - arquivos sensiveis expostos (RF08, RF09, issue #31).

Para cada host ativo, testa uma lista curta de caminhos conhecidos (recorte
do SecLists, `Discovery/Web-Content/` - focado em erro de configuracao, nao
em brute force de diretorio).

Cada caminho tem uma assinatura de conteudo: muito servidor responde 200
com a pagina inicial/404 customizada pra qualquer URL (soft-404), e isso
nao pode virar achado critico. Confirmada a assinatura, o achado e critico
direto, sem passar pela IA (RF09) - a propria exposicao ja e a falha.

O conteudo do arquivo NAO e persistido (um .env exposto tem credencial em
claro) - so metadados da resposta e o hash dos primeiros bytes lidos.
"""

import asyncio
import hashlib
import re
from dataclasses import dataclass

import httpx

from app.config import settings
from app.services.js_scanner.downloader import HostGuard, fetch_limited


@dataclass(frozen=True)
class SensitivePath:
    path: str
    description: str
    signature: re.Pattern[str]


SENSITIVE_PATHS: list[SensitivePath] = [
    SensitivePath("/.env", "Variaveis de ambiente da aplicacao",
                  re.compile(r"^\s*[A-Z][A-Z0-9_]{2,}\s*=", re.MULTILINE)),
    SensitivePath("/.env.production", "Variaveis de ambiente de producao",
                  re.compile(r"^\s*[A-Z][A-Z0-9_]{2,}\s*=", re.MULTILINE)),
    SensitivePath("/.env.local", "Variaveis de ambiente locais",
                  re.compile(r"^\s*[A-Z][A-Z0-9_]{2,}\s*=", re.MULTILINE)),
    SensitivePath("/.git/config", "Configuracao do repositorio git",
                  re.compile(r"^\s*\[(core|remote|branch)\b", re.MULTILINE)),
    SensitivePath("/.git/HEAD", "Ponteiro HEAD do repositorio git",
                  re.compile(r"^ref: refs/|^[0-9a-f]{40}\s*$", re.MULTILINE)),
    SensitivePath("/.svn/entries", "Metadados do repositorio SVN",
                  re.compile(r"^(?:\d+\s*$|<\?xml)", re.MULTILINE)),
    SensitivePath("/config.json", "Arquivo de configuracao JSON",
                  re.compile(r"(?i)\"[^\"]*(?:pass|secret|token|key|database|db_|host)[^\"]*\"\s*:")),
    SensitivePath("/wp-config.php.bak", "Backup da configuracao do WordPress",
                  re.compile(r"DB_(?:NAME|USER|PASSWORD)")),
    SensitivePath("/wp-config.php~", "Backup da configuracao do WordPress",
                  re.compile(r"DB_(?:NAME|USER|PASSWORD)")),
    SensitivePath("/.htpasswd", "Hashes de senha do Apache",
                  re.compile(r"^[^:\s]+:(?:\$apr1\$|\$2[aby]\$|\{SHA\}|[./0-9A-Za-z]{13}$)", re.MULTILINE)),
    SensitivePath("/.DS_Store", "Indice de arquivos do macOS",
                  re.compile(r"Bud1")),
    SensitivePath("/docker-compose.yml", "Definicao de servicos Docker",
                  re.compile(r"^\s*services\s*:", re.MULTILINE)),
    SensitivePath("/.aws/credentials", "Credenciais da AWS",
                  re.compile(r"aws_access_key_id", re.IGNORECASE)),
    SensitivePath("/.npmrc", "Configuracao do npm (pode ter token)",
                  re.compile(r"(?:_authToken|registry)\s*=")),
    SensitivePath("/backup.sql", "Dump de banco de dados",
                  re.compile(r"(?i)(?:CREATE TABLE|INSERT INTO|-- MySQL dump|PostgreSQL database dump)")),
    SensitivePath("/dump.sql", "Dump de banco de dados",
                  re.compile(r"(?i)(?:CREATE TABLE|INSERT INTO|-- MySQL dump|PostgreSQL database dump)")),
    SensitivePath("/phpinfo.php", "Saida do phpinfo()",
                  re.compile(r"PHP Version|phpinfo\(\)")),
    SensitivePath("/server-status", "Status do Apache (mod_status)",
                  re.compile(r"Apache Server Status")),
]

# HTML so e esperado no phpinfo/server-status - nos outros e soft-404
_HTML_ALLOWED = {"/phpinfo.php", "/server-status"}


@dataclass(frozen=True)
class ExposedFile:
    url: str
    path: str
    description: str
    status_code: int
    content_type: str
    bytes_read: int
    sha256: str

    def evidence(self) -> dict:
        return {
            "url": self.url,
            "path": self.path,
            "description": self.description,
            "status_code": self.status_code,
            "content_type": self.content_type,
            "bytes_read": self.bytes_read,
            "sha256": self.sha256,
        }


async def check_sensitive_files(
    client: httpx.AsyncClient, guard: HostGuard, base_url: str
) -> list[ExposedFile]:
    base_url = base_url.rstrip("/")
    results = await asyncio.gather(
        *[_check(client, guard, base_url, item) for item in SENSITIVE_PATHS]
    )
    return [r for r in results if r is not None]


async def _check(
    client: httpx.AsyncClient, guard: HostGuard, base_url: str, item: SensitivePath
) -> ExposedFile | None:
    url = base_url + item.path
    result = await fetch_limited(client, guard, url, max_bytes=settings.sensitive_file_max_bytes, truncate=True)
    if result is None or result.status_code != 200 or not result.content:
        return None
    if not matches_signature(item, result.content, result.content_type):
        return None
    return ExposedFile(
        url=url,
        path=item.path,
        description=item.description,
        status_code=result.status_code,
        content_type=result.content_type,
        bytes_read=len(result.content),
        sha256=hashlib.sha256(result.content).hexdigest(),
    )


def matches_signature(item: SensitivePath, content: bytes, content_type: str) -> bool:
    text = content.decode(errors="replace")
    looks_html = "text/html" in content_type.lower() or text.lstrip()[:15].lower().startswith(("<!doctype", "<html"))
    if looks_html and item.path not in _HTML_ALLOWED:
        return False
    return bool(item.signature.search(text))

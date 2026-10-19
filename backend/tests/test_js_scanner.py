"""Testes do modulo Codigo Web (RF05-RF09, issues #11-#14, #31)."""

from pathlib import Path

import pytest

from app.services.js_scanner.discovery import discover_js_urls, is_in_scope
from app.services.js_scanner.downloader import JsFile
from app.services.js_scanner.endpoint_extractor import extract_endpoints
from app.services.js_scanner.secret_scanner import (
    mask_secret,
    scan_with_regex,
    shannon_entropy,
)
from app.services.js_scanner.sensitive_files import SENSITIVE_PATHS, matches_signature


# --- discovery (RF05) ---

def test_discover_resolves_relative_and_absolute_and_dedups():
    html = """
    <script src="/static/app.js"></script>
    <script src="https://app.exemplo.com/vendor.js"></script>
    <script src="//cdn.terceiro.com/x.js"></script>
    <script src="/static/app.js"></script>
    <script>console.log('inline ignorado')</script>
    """
    urls = discover_js_urls("https://app.exemplo.com/home", html)
    assert urls == [
        "https://app.exemplo.com/static/app.js",
        "https://app.exemplo.com/vendor.js",
        "https://cdn.terceiro.com/x.js",
    ]


def test_discover_empty_body_returns_nothing():
    assert discover_js_urls("https://x.com", None) == []
    assert discover_js_urls("https://x.com", "") == []


@pytest.mark.parametrize("url,expected", [
    ("https://app.exemplo.com/a.js", True),
    ("https://exemplo.com/a.js", True),
    ("https://cdn.jsdelivr.net/a.js", False),
    ("https://exemplo.com.atacante.net/a.js", False),
])
def test_is_in_scope(url, expected):
    assert is_in_scope(url, "exemplo.com") is expected


# --- endpoint extraction (RF06) ---

def test_extract_endpoints_catches_calls_and_paths():
    js = """
    fetch("/api/users/profile");
    axios.post('/v2/login', data);
    var x = "/admin/internal/config";
    const img = "/assets/logo.png";
    xhr.open("GET", "https://exemplo.com/graphql");
    """
    endpoints = extract_endpoints(js)
    assert "/api/users/profile" in endpoints
    assert "/v2/login" in endpoints
    assert "/admin/internal/config" in endpoints
    assert "https://exemplo.com/graphql" in endpoints
    assert "/assets/logo.png" not in endpoints  # asset filtrado


def test_extract_endpoints_dedups_and_caps():
    js = ";".join(f'fetch("/api/item/{i}")' for i in range(300))
    endpoints = extract_endpoints(js)
    assert len(endpoints) <= 200
    assert len(endpoints) == len(set(endpoints))


# --- secret scanner fallback (RF07, issue #29) ---

def _js(content: str) -> JsFile:
    return JsFile(url="https://exemplo.com/app.js", sha256="abc", path=Path("app.js"), content=content)


def test_regex_detects_aws_key_and_masks_it():
    secret = "AKIAIOSFODNN7EXAMPLE"
    found = scan_with_regex([_js(f'const k = "{secret}";')])
    assert len(found) == 1
    c = found[0]
    assert c.rule == "aws-access-key-id"
    assert c.detector == "regex-fallback"
    assert secret not in c.masked_secret
    assert secret not in c.context
    assert "AKIA" in c.masked_secret


# Tokens montados por concatenacao de proposito: sao fixtures sinteticos e
# o literal contiguo dispararia o secret-scanning (push protection) do GitHub.
@pytest.mark.parametrize("snippet,rule", [
    ('var k="AIza' + 'SyA1234567890abcdefghijklmnopqrstuv";', "gcp-api-key"),
    ('token="xox' + 'b-EXAMPLEFAKE-NOTAREALTOKEN";', "slack-token"),
    ('key="sk_' + 'live_EXAMPLEFAKENOTAREALKEY00";', "stripe-key"),
    ('const p = { password: "S3nh4Sup3rF0rt3Abc" }', "generic-api-key"),
])
def test_regex_rules_match(snippet, rule):
    rules = {c.rule for c in scan_with_regex([_js(snippet)])}
    assert rule in rules


def test_regex_ignores_low_entropy_generic():
    # placeholder obvio: entropia baixa, nao deve virar candidato
    assert scan_with_regex([_js('password = "aaaaaaaaaaaaaaaa"')]) == []


def test_regex_dedups_same_secret_in_file():
    secret = "AKIAIOSFODNN7EXAMPLE"
    found = scan_with_regex([_js(f'a="{secret}"; b="{secret}";')])
    assert len(found) == 1


def test_mask_secret_never_leaks_value():
    assert mask_secret("short") == "<redacted 5 chars>"
    masked = mask_secret("AKIAIOSFODNN7EXAMPLE")
    assert "IOSFODNN7" not in masked
    assert masked.startswith("AKIA")


def test_shannon_entropy_monotonic():
    assert shannon_entropy("aaaaaaaa") < shannon_entropy("aB3xZ9qW")


# --- sensitive files (RF08, RF09, issue #31) ---

def _sig(path: str):
    return next(p for p in SENSITIVE_PATHS if p.path == path)


def test_signature_confirms_real_env_file():
    content = b"DATABASE_URL=postgres://user:pass@db/app\nSECRET_KEY=xyz\n"
    assert matches_signature(_sig("/.env"), content, "text/plain")


def test_signature_rejects_soft_404_html():
    html = b"<!DOCTYPE html><html><body>Pagina nao encontrada</body></html>"
    assert not matches_signature(_sig("/.env"), html, "text/html")


def test_signature_confirms_git_config():
    content = b'[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = x\n'
    assert matches_signature(_sig("/.git/config"), content, "text/plain")


def test_signature_allows_html_only_for_phpinfo():
    html = b"<!DOCTYPE html><html><title>phpinfo()</title><body>PHP Version 8.1</body></html>"
    assert matches_signature(_sig("/phpinfo.php"), html, "text/html")

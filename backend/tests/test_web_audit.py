"""Auditoria Web (cabecalhos, CORS, TLS, SPF/DMARC) e feed de eventos."""

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import (
    AIVerdict,
    Domain,
    EventKind,
    Finding,
    FindingCategory,
    ScanEvent,
    ScanJob,
)
from app.services import web_audit
from app.services.js_scanner import LiveHost
from app.services.scan_events import emit, emit_list
from app.services.web_audit.cors import PROBE_ORIGIN, analyze_cors
from app.services.web_audit.email_security import analyze_email_records
from app.services.web_audit.headers import analyze_headers
from app.services.web_audit.tls import CertInfo

SAFE_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000",
    "Content-Security-Policy": "default-src 'self'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=()",
}


# ── cabecalhos ────────────────────────────────────────────────────────────


def test_headers_all_present_is_clean():
    report = analyze_headers("https://a.example.com", 200, SAFE_HEADERS, [])
    assert report.missing == []
    assert report.disclosed == {}
    assert report.insecure_cookies == []


def test_headers_missing_are_listed():
    report = analyze_headers("https://a.example.com", 200, {"X-Frame-Options": "DENY"}, [])
    assert "content-security-policy" in report.missing
    assert "strict-transport-security" in report.missing
    assert "x-frame-options" not in report.missing


def test_hsts_not_required_over_http():
    report = analyze_headers("http://a.example.com", 200, {}, [])
    assert "strict-transport-security" not in report.missing


def test_csp_frame_ancestors_replaces_x_frame_options():
    headers = {"Content-Security-Policy": "frame-ancestors 'none'"}
    report = analyze_headers("https://a.example.com", 200, headers, [])
    assert "x-frame-options" not in report.missing


def test_server_without_version_is_not_disclosure():
    report = analyze_headers("https://a.example.com", 200, {**SAFE_HEADERS, "Server": "nginx"}, [])
    assert report.disclosed == {}


def test_version_disclosure_detected():
    headers = {**SAFE_HEADERS, "Server": "Apache/2.4.29 (Ubuntu)", "X-Powered-By": "PHP/7.2.1"}
    report = analyze_headers("https://a.example.com", 200, headers, [])
    assert report.disclosed == {"server": "Apache/2.4.29 (Ubuntu)", "x-powered-by": "PHP/7.2.1"}


def test_cookie_flags_never_include_cookie_value():
    report = analyze_headers(
        "https://a.example.com", 200, SAFE_HEADERS,
        ["session=SUPER-SECRET-VALUE; Path=/", "ok=1; Secure; HttpOnly; SameSite=Lax"],
    )
    assert report.insecure_cookies == [{"cookie": "session", "missing_flags": ["Secure", "HttpOnly", "SameSite"]}]
    assert "SUPER-SECRET-VALUE" not in str(report.missing_evidence())


# ── CORS ──────────────────────────────────────────────────────────────────


def test_cors_reflected_origin_with_credentials():
    issue = analyze_cors("https://api.example.com", 200, {
        "Access-Control-Allow-Origin": PROBE_ORIGIN,
        "Access-Control-Allow-Credentials": "true",
    })
    assert issue["issue"] == "reflected_origin"
    assert issue["access_control_allow_credentials"] is True


def test_cors_null_origin():
    issue = analyze_cors("https://api.example.com", 200, {"Access-Control-Allow-Origin": "null"})
    assert issue["issue"] == "null_origin"


@pytest.mark.parametrize("headers", [{}, {"Access-Control-Allow-Origin": "*"},
                                     {"Access-Control-Allow-Origin": "https://app.example.com"}])
def test_cors_safe_configurations(headers):
    assert analyze_cors("https://api.example.com", 200, headers) is None


# ── SPF / DMARC ───────────────────────────────────────────────────────────


def test_email_strict_policy_has_no_issues():
    result = analyze_email_records("example.com", ["v=spf1 include:_spf.google.com -all"], ["v=DMARC1; p=reject"])
    assert result["issues"] == []
    assert result["dmarc_policy"] == "reject"


def test_email_missing_records():
    result = analyze_email_records("example.com", [], [])
    assert result["issues"] == ["sem registro SPF", "sem registro DMARC"]


def test_email_weak_records():
    result = analyze_email_records("example.com", ["v=spf1 +all"], ["v=DMARC1; p=none; rua=mailto:x@example.com"])
    assert len(result["issues"]) == 2
    assert result["dmarc_policy"] == "none"


# ── TLS ───────────────────────────────────────────────────────────────────


def test_cert_days_left():
    cert = CertInfo(hostname="a.example.com", valid=True, not_after=datetime.now(UTC) + timedelta(days=10, hours=1))
    assert cert.days_left == 10
    assert cert.evidence()["days_left"] == 10


# ── modulo integrado ao banco ─────────────────────────────────────────────


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine)
    engine.dispose()


@pytest.fixture
def db(session_factory):
    session = session_factory()
    yield session
    session.close()


@pytest.fixture
def scan_job(db):
    domain = Domain(name="example.com", authorized=True)
    db.add(domain)
    db.flush()
    job = ScanJob(domain_id=domain.id)
    db.add(job)
    db.commit()
    return job


def test_audit_hosts_persists_findings_and_events(db, scan_job, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        headers = {"Server": "Apache/2.4.29"}
        if request.headers.get("origin") == PROBE_ORIGIN:
            headers["Access-Control-Allow-Origin"] = PROBE_ORIGIN
            headers["Access-Control-Allow-Credentials"] = "true"
        return httpx.Response(200, headers=headers, text="ok")

    monkeypatch.setattr(web_audit, "build_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))

    async def public(self, url):
        return True

    monkeypatch.setattr(web_audit.HostGuard, "is_public", public)

    async def cert(hostname, **_):
        return CertInfo(hostname=hostname, valid=False, error="certificate has expired")

    monkeypatch.setattr(web_audit, "inspect_certificate", cert)

    async def email(domain):
        return analyze_email_records(domain, [], [])

    monkeypatch.setattr(web_audit, "check_email_security", email)

    hosts = [
        LiveHost(subdomain_id=None, hostname="app.example.com", url="https://app.example.com"),
        LiveHost(subdomain_id=None, hostname="old.example.com", url="http://old.example.com"),
        LiveHost(subdomain_id=None, hostname="cdn.terceiro.com", url="https://cdn.terceiro.com"),  # fora do escopo
    ]
    asyncio.run(web_audit.audit_hosts(db, scan_job, hosts))

    findings = db.scalars(select(Finding)).all()
    assert {f.category for f in findings} == {FindingCategory.MISCONFIGURATION}
    assert {f.ai_verdict for f in findings} == {AIVerdict.PENDING}
    tools = sorted(f.source_tool for f in findings)
    # app + old: headers ausentes, versao exposta, CORS; app: certificado; old: sem HTTPS; dominio: e-mail
    assert tools.count("security-headers") == 4
    assert tools.count("cors-check") == 2
    assert tools.count("tls-check") == 2
    assert tools.count("email-security") == 1
    assert not any("terceiro" in f.target for f in findings)

    events = db.scalars(select(ScanEvent)).all()
    assert all(e.stage == "web_audit" for e in events)
    assert any(e.kind == EventKind.ALERT and "CORS" in e.message for e in events)


def test_emit_list_caps_long_lists(db, scan_job):
    emit_list(db, scan_job.id, "enumerating", (f"host{i}" for i in range(50)), limit=10)
    events = db.scalars(select(ScanEvent)).all()
    assert len(events) == 11
    assert events[-1].message == "... e mais 40 itens"


def test_events_endpoint_is_incremental(session_factory, db, scan_job):
    for i in range(3):
        emit(db, scan_job.id, "enumerating", f"evento {i}")

    def override():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override
    try:
        client = TestClient(app)
        first = client.get(f"/api/scans/{scan_job.id}/events").json()
        assert [e["message"] for e in first] == ["evento 0", "evento 1", "evento 2"]
        after = client.get(f"/api/scans/{scan_job.id}/events", params={"after_id": first[1]["id"]}).json()
        assert [e["message"] for e in after] == ["evento 2"]
        assert client.get("/api/scans/999/events").status_code == 404
    finally:
        app.dependency_overrides.clear()

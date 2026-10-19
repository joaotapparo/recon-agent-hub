"""Integracao do modulo Codigo Web com o banco + endpoints (issues #15, #20, #21)."""

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import (
    AIVerdict,
    Domain,
    Finding,
    FindingCategory,
    Report,
    ScanJob,
    Severity,
)
from app.services import js_scanner
from app.services.js_scanner import LiveHost
from app.services.js_scanner.downloader import JsFile


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine)
    engine.dispose()


@pytest.fixture
def db(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture
def scan(db):
    domain = Domain(name="exemplo.com", authorized=True)
    db.add(domain)
    db.flush()
    job = ScanJob(domain=domain)
    db.add(job)
    db.commit()
    return job


def test_scan_hosts_persists_findings(db, scan, monkeypatch):
    html = '<script src="/app.js"></script>'
    js = JsFile(
        url="https://exemplo.com/app.js",
        sha256="deadbeef",
        path=None,
        content='fetch("/api/secret/data"); const k="AKIAIOSFODNN7EXAMPLE";',
    )

    async def fake_fetch(client, guard, url, **kwargs):
        from app.services.js_scanner.downloader import FetchResult
        return FetchResult(url=url, status_code=200, content_type="text/html", content=html.encode())

    async def fake_download(client, guard, urls, scan_job_id):
        return [js] if urls else []

    async def no_sensitive(client, guard, base_url):
        return []

    monkeypatch.setattr(js_scanner, "fetch_limited", fake_fetch)
    monkeypatch.setattr(js_scanner, "download_js_files", fake_download)
    monkeypatch.setattr(js_scanner, "check_sensitive_files", no_sensitive)

    async def fake_secrets(files, scan_job_id):
        from app.services.js_scanner.secret_scanner import scan_with_regex
        return scan_with_regex(files)

    monkeypatch.setattr(js_scanner, "find_secrets", fake_secrets)

    host = LiveHost(subdomain_id=None, hostname="exemplo.com", url="https://exemplo.com/", body=html)
    asyncio.run(js_scanner.scan_hosts(db, scan, [host]))

    findings = db.query(Finding).filter(Finding.scan_job_id == scan.id).all()
    categories = {f.category for f in findings}
    assert FindingCategory.EXPOSED_ENDPOINT in categories
    assert FindingCategory.EXPOSED_SECRET in categories
    secret = next(f for f in findings if f.category == FindingCategory.EXPOSED_SECRET)
    assert secret.ai_verdict == AIVerdict.PENDING
    # a evidencia persistida nao pode conter o valor bruto
    assert "AKIAIOSFODNN7EXAMPLE" not in str(secret.raw_evidence)


def test_endpoints_findings_and_report(session_factory):
    with session_factory() as db:
        domain = Domain(name="exemplo.com", authorized=True)
        db.add(domain)
        db.flush()
        job = ScanJob(domain=domain)
        db.add(job)
        db.flush()
        db.add(Finding(
            scan_job_id=job.id, domain_id=domain.id,
            category=FindingCategory.MISCONFIGURATION, source_tool="sensitive-files",
            title="Arquivo sensivel", target="https://exemplo.com/.env",
            ai_verdict=AIVerdict.TRUE_POSITIVE, ai_severity=Severity.CRITICAL,
        ))
        db.add(Finding(
            scan_job_id=job.id, domain_id=domain.id,
            category=FindingCategory.EXPOSED_ENDPOINT, source_tool="endpoint-regex",
            title="Endpoint", target="https://exemplo.com/app.js",
            ai_verdict=AIVerdict.PENDING,
        ))
        db.add(Report(
            scan_job_id=job.id, domain_id=domain.id,
            summary="1 confirmado", markdown_content="# Relatorio\n\nconteudo",
            ai_model_used="none",
        ))
        db.commit()
        job_id = job.id

    app.dependency_overrides[get_db] = lambda: session_factory().__enter__()
    try:
        client = TestClient(app)

        resp = client.get(f"/api/scans/{job_id}/findings")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

        resp = client.get(f"/api/scans/{job_id}/findings", params={"category": "misconfiguration"})
        assert [f["category"] for f in resp.json()] == ["misconfiguration"]

        resp = client.get(f"/api/scans/{job_id}/findings", params={"severity": "critical"})
        assert len(resp.json()) == 1

        resp = client.get(f"/api/scans/{job_id}/findings", params={"verdict": "pending"})
        assert [f["category"] for f in resp.json()] == ["exposed_endpoint"]

        resp = client.get(f"/api/scans/{job_id}/report")
        assert resp.status_code == 200
        assert resp.json()["markdown_content"].startswith("# Relatorio")

        resp = client.get(f"/api/scans/{job_id}/report.md")
        assert resp.status_code == 200
        assert "attachment" in resp.headers["content-disposition"]

        assert client.get("/api/scans/99999/report").status_code == 404
        assert client.get("/api/scans/99999/findings").status_code == 404
    finally:
        app.dependency_overrides.clear()

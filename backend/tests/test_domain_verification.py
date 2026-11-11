"""Verificacao de posse do dominio por registro TXT."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import Domain, ScanJob
from app.routers import domains as domains_router
from app.services import domain_verification


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine)
    engine.dispose()


@pytest.fixture
def dns_txt(monkeypatch):
    """Registros TXT falsos: {nome: [valores]}."""
    records: dict[str, list[str]] = {}
    monkeypatch.setattr(domain_verification, "_txt_values", lambda name: records.get(name, []))
    return records


@pytest.fixture
def client(session_factory, monkeypatch, dns_txt):
    def override():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    enqueued: list[int] = []
    monkeypatch.setattr(domains_router, "enqueue", enqueued.append)
    monkeypatch.setattr(domains_router, "assert_domain_is_public", lambda name: None)
    monkeypatch.setattr(settings, "domain_verification_required", True)
    app.dependency_overrides[get_db] = override
    try:
        c = TestClient(app)
        c.enqueued = enqueued
        yield c
    finally:
        app.dependency_overrides.clear()


def submit(client, name="empresa.com.br"):
    return client.post("/api/domains", json={"name": name, "authorization_confirmed": True})


def test_new_domain_gets_challenge_and_no_scan(client):
    res = submit(client)
    assert res.status_code == 202
    body = res.json()
    assert body["scan_job_id"] is None
    assert body["verification"]["record_name"] == "_recon-agent-hub.empresa.com.br"
    assert body["verification"]["record_value"].startswith("recon-agent-hub-verify=")
    assert client.enqueued == []


def test_challenge_is_stable_between_submits(client):
    first = submit(client).json()["verification"]["record_value"]
    second = submit(client).json()["verification"]["record_value"]
    assert first == second


def test_verify_without_record_fails(client):
    domain_id = submit(client).json()["domain_id"]
    res = client.post(f"/api/domains/{domain_id}/verify")
    assert res.status_code == 400
    assert "não encontrado" in res.json()["detail"]
    assert client.enqueued == []


def test_verify_with_wrong_value_fails(client, dns_txt):
    domain_id = submit(client).json()["domain_id"]
    dns_txt["_recon-agent-hub.empresa.com.br"] = ["recon-agent-hub-verify=outro-token"]
    res = client.post(f"/api/domains/{domain_id}/verify")
    assert res.status_code == 400
    assert "não confere" in res.json()["detail"]


def test_verify_with_record_starts_scan(client, dns_txt):
    body = submit(client).json()
    dns_txt[body["verification"]["record_name"]] = [body["verification"]["record_value"]]

    res = client.post(f"/api/domains/{body['domain_id']}/verify")
    assert res.status_code == 201
    assert res.json()["scan_job_id"] is not None
    assert client.enqueued == [res.json()["scan_job_id"]]

    listed = client.get("/api/domains").json()[0]
    assert listed["verified"] is True
    assert listed["verification"] is None

    # ja verificado: novo submit e rescan disparam direto
    assert submit(client).status_code == 201
    assert client.post(f"/api/domains/{body['domain_id']}/rescan").status_code == 201


def test_rescan_unverified_domain_is_blocked(client):
    domain_id = submit(client).json()["domain_id"]
    res = client.post(f"/api/domains/{domain_id}/rescan")
    assert res.status_code == 400
    assert client.enqueued == []


def test_exempt_test_targets_skip_verification(client):
    assert submit(client, "scanme.nmap.org").status_code == 201
    assert submit(client, "testphp.vulnweb.com").status_code == 201
    assert len(client.enqueued) == 2


def test_lookalike_of_exempt_domain_is_not_exempt():
    assert not domain_verification.is_exempt("evilvulnweb.com")
    assert not domain_verification.is_exempt("scanme.nmap.org.evil.com")


def test_verification_expires(monkeypatch):
    monkeypatch.setattr(settings, "domain_verification_required", True)
    domain = Domain(name="empresa.com.br", verified_at=datetime.utcnow() - timedelta(days=31))
    assert not domain_verification.is_verified(domain)
    domain.verified_at = datetime.utcnow() - timedelta(days=29)
    assert domain_verification.is_verified(domain)


def test_orchestrator_refuses_unverified_domain(session_factory, monkeypatch):
    import asyncio

    from app.services import orchestrator

    monkeypatch.setattr(settings, "domain_verification_required", True)
    monkeypatch.setattr(orchestrator, "SessionLocal", session_factory)
    db = session_factory()
    domain = Domain(name="empresa.com.br")
    db.add(domain)
    db.flush()
    job = ScanJob(domain_id=domain.id)
    db.add(job)
    db.commit()

    with pytest.raises(PermissionError):
        asyncio.run(orchestrator.run_scan_job(job.id))
    db.refresh(job)
    assert job.status.value == "failed"
    db.close()

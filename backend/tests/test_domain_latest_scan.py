"""Teste C7: a reanalise mais nova e a exibida no painel, mesmo criada no mesmo segundo."""

from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Domain, ScanJob


def test_reanalises_no_mesmo_segundo_mostram_a_mais_nova():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)

    db = factory()
    domain = Domain(name="scanme.nmap.org", authorized=True)
    db.add(domain)
    db.flush()
    same_second = datetime(2026, 11, 22, 20, 52, 45)
    # o SQLite devolve sem microssegundos: duas reanalises seguidas empatam
    jobs = [ScanJob(domain_id=domain.id, created_at=same_second) for _ in range(3)]
    db.add_all(jobs)
    db.commit()
    newest, domain_id = jobs[-1].id, domain.id
    db.close()

    def override():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override
    try:
        client = TestClient(app)
        assert client.get(f"/api/domains/{domain_id}").json()["latest_scan_id"] == newest
        assert client.get("/api/domains").json()[0]["latest_scan_id"] == newest
    finally:
        app.dependency_overrides.clear()
        engine.dispose()

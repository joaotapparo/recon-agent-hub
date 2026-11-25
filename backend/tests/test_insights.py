"""Globo dos servidores (geoip) e cadeias de ataque (regras + IA)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import (
    AIVerdict,
    Domain,
    Finding,
    FindingCategory,
    ScanJob,
    ScanStatus,
    Severity,
    Subdomain,
)
from app.services import geoip
from app.services.ai_triage import attack_chains


@pytest.fixture
def session_factory(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "scans_dir", tmp_path / "scans")
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine)
    engine.dispose()


@pytest.fixture
def client(session_factory):
    def override():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _finding(scan, category, tool, *, verdict=AIVerdict.TRUE_POSITIVE, severity=Severity.HIGH, evidence=None):
    return Finding(
        scan_job_id=scan.id,
        domain_id=scan.domain_id,
        category=category,
        source_tool=tool,
        title=f"{tool} achado",
        target="https://app.example.com",
        raw_evidence=evidence or {},
        ai_verdict=verdict,
        ai_severity=severity if verdict == AIVerdict.TRUE_POSITIVE else None,
    )


@pytest.fixture
def seeded(session_factory):
    db = session_factory()
    domain = Domain(name="example.com", authorized=True)
    db.add(domain)
    db.flush()
    scan = ScanJob(domain_id=domain.id, status=ScanStatus.COMPLETED)
    db.add(scan)
    db.flush()
    db.add(Subdomain(scan_job_id=scan.id, domain_id=domain.id, hostname="app.example.com",
                     ip_addresses=["8.8.8.8", "10.0.0.1"], http_status=200))
    findings = [
        _finding(scan, FindingCategory.MISCONFIGURATION, "sensitive-files", severity=Severity.CRITICAL),
        _finding(scan, FindingCategory.EXPOSED_SECRET, "gitleaks"),
        _finding(scan, FindingCategory.EXPOSED_ENDPOINT, "endpoint-extractor", verdict=AIVerdict.NEEDS_REVIEW),
        _finding(scan, FindingCategory.MISCONFIGURATION, "cors-check", verdict=AIVerdict.FALSE_POSITIVE),
    ]
    db.add_all(findings)
    db.commit()
    result = scan.id, [f.id for f in findings]
    db.close()
    return result


def test_regras_montam_cadeias_e_ignoram_falso_positivo(session_factory, seeded):
    _, (sensitive, secret, endpoint, _cors) = seeded
    db = session_factory()
    chains = attack_chains.build_rule_chains(db.query(Finding).all())
    by_id = {c.id: c for c in chains}

    assert "rule-cors" not in by_id  # o unico CORS foi descartado como falso positivo
    assert by_id["rule-sensitive-file"].severity == "critical"
    assert by_id["rule-sensitive-file"].steps[0].finding_ids == [sensitive]
    api = by_id["rule-secret-api"]
    assert [s.kind for s in api.steps] == ["entry", "pivot", "impact"]
    assert api.steps[1].finding_ids == [endpoint]
    # a mais grave primeiro
    assert chains[0].id == "rule-sensitive-file"
    assert secret in api.steps[0].finding_ids


def test_sanitize_descarta_ids_inventados_e_cadeia_sem_achado(session_factory, seeded):
    _, (sensitive, *_rest) = seeded
    db = session_factory()
    findings = db.query(Finding).all()
    raw = [
        {"title": "Boa", "impact": "x", "severity": "critical", "steps": [
            {"title": "a", "description": "", "kind": "entry", "finding_ids": [sensitive, 9999]},
            {"title": "b", "description": "", "kind": "inventado", "finding_ids": []},
        ]},
        {"title": "So inventada", "impact": "x", "severity": "high", "steps": [
            {"title": "a", "description": "", "kind": "entry", "finding_ids": [9999]},
            {"title": "b", "description": "", "kind": "impact", "finding_ids": []},
        ]},
    ]
    chains = attack_chains.sanitize_ai_chains(raw, findings)
    assert len(chains) == 1
    assert chains[0].steps[0].finding_ids == [sensitive]
    assert chains[0].steps[1].kind == "pivot"


def test_get_sem_ia_devolve_regras(client, seeded):
    scan_id, _ = seeded
    data = client.get(f"/api/scans/{scan_id}/attack-chains").json()
    assert data["source"] == "rules"
    assert data["chains"]


def test_post_sem_chave_cai_nas_regras_com_aviso(client, seeded):
    scan_id, _ = seeded
    data = client.post(f"/api/scans/{scan_id}/attack-chains").json()
    assert data["source"] == "rules"
    assert "IA indisponível" in data["warning"]


def test_post_com_ia_grava_cache(client, seeded, monkeypatch):
    scan_id, (sensitive, *_rest) = seeded

    class FakeProvider:
        model = "fake-model"

        async def generate_attack_chains(self, domain, findings):
            assert all(f.ai_verdict != AIVerdict.FALSE_POSITIVE for f in findings)
            return [{"title": "IA", "impact": "y", "severity": "high", "steps": [
                {"title": "entrada", "description": "d", "kind": "entry", "finding_ids": [sensitive]},
                {"title": "impacto", "description": "d", "kind": "impact", "finding_ids": []},
            ]}]

    monkeypatch.setattr("app.services.ai_triage.get_triage_provider", lambda: FakeProvider())
    data = client.post(f"/api/scans/{scan_id}/attack-chains").json()
    assert data["source"] == "ai" and data["model"] == "fake-model"
    # o GET seguinte le do cache
    again = client.get(f"/api/scans/{scan_id}/attack-chains").json()
    assert again["source"] == "ai"
    assert again["chains"][0]["title"] == "IA"


def test_post_recusa_scan_em_andamento(client, session_factory, seeded):
    scan_id, _ = seeded
    db = session_factory()
    db.get(ScanJob, scan_id).status = ScanStatus.SCANNING_JS
    db.commit()
    assert client.post(f"/api/scans/{scan_id}/attack-chains").status_code == 409


def test_geo_so_consulta_ip_publico(client, seeded, monkeypatch):
    scan_id, _ = seeded
    asked = []

    async def fake_lookup(_client, ip):
        asked.append(ip)
        return geoip.GeoPoint(ip=ip, lat=1.0, lon=2.0, city="X", country="Y", country_code="YY", org="Org")

    async def fake_self():
        return geoip.GeoPoint(ip="9.9.9.9", lat=5.0, lon=6.0, city="Origem", country="BR", country_code="BR", org=None)

    monkeypatch.setattr(geoip, "_lookup", fake_lookup)
    monkeypatch.setattr(geoip, "locate_self", fake_self)
    data = client.get(f"/api/scans/{scan_id}/geo").json()
    assert data["origin"] == {"lat": 5.0, "lon": 6.0, "city": "Origem", "country": "BR"}
    data = data["points"]
    assert asked == ["8.8.8.8"]  # 10.0.0.1 e privado: nunca sai para o servico externo
    assert data == [{
        "hostname": "app.example.com", "active": True, "ip": "8.8.8.8", "lat": 1.0, "lon": 2.0,
        "city": "X", "country": "Y", "country_code": "YY", "org": "Org",
    }]


def test_geo_desligado_nao_consulta(client, seeded, monkeypatch):
    scan_id, _ = seeded
    monkeypatch.setattr(settings, "geoip_enabled", False)

    async def boom(*_):
        raise AssertionError("nao deveria consultar")

    monkeypatch.setattr(geoip, "_lookup", boom)
    assert client.get(f"/api/scans/{scan_id}/geo").json() == {"origin": None, "points": []}


def test_geo_cache_em_disco(session_factory):
    point = geoip.GeoPoint(ip="1.1.1.1", lat=1, lon=2, city=None, country=None, country_code=None, org=None)
    geoip._write_cache(point)
    assert geoip._read_cache("1.1.1.1") == point

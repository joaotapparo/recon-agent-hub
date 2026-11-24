"""Revisao humana: a IA sugere, o profissional decide."""

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
from app.services.ai_triage.report_builder import rebuild_report, render_report

AI_SUMMARY = "Resumo escrito pela IA."


@pytest.fixture
def session_factory():
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


@pytest.fixture
def seeded(session_factory):
    """Scan concluido com relatorio: uma chave que a IA descartou e outra que ela confirmou."""
    db = session_factory()
    domain = Domain(name="example.com", authorized=True)
    db.add(domain)
    db.flush()
    scan = ScanJob(domain_id=domain.id)
    db.add(scan)
    db.flush()
    base = {
        "scan_job_id": scan.id,
        "domain_id": domain.id,
        "category": FindingCategory.EXPOSED_SECRET,
        "source_tool": "gitleaks",
        "target": "https://example.com/app.js",
        "raw_evidence": {"masked_secret": "AKIA...WXYZ"},
    }
    discarded = Finding(
        **base, title="Chave descartada pela IA", ai_verdict=AIVerdict.FALSE_POSITIVE,
        ai_reasoning="Parece um placeholder.",
    )
    confirmed = Finding(
        **base, title="Chave confirmada pela IA", ai_verdict=AIVerdict.TRUE_POSITIVE,
        ai_severity=Severity.HIGH, ai_reasoning="Formato de chave real.",
    )
    db.add_all([discarded, confirmed])
    db.flush()
    db.add(Report(
        scan_job_id=scan.id, domain_id=domain.id, markdown_content="antigo",
        ai_model_used="gemini-teste", ai_summary=AI_SUMMARY,
    ))
    db.commit()
    ids = {"scan": scan.id, "discarded": discarded.id, "confirmed": confirmed.id}
    db.close()
    return ids


def review(client, finding_id, **body):
    return client.put(f"/api/findings/{finding_id}/review", json=body)


def report_md(client, scan_id):
    return client.get(f"/api/scans/{scan_id}/report").json()["markdown_content"]


def test_profissional_reverte_falso_positivo_da_ia(client, seeded):
    resp = review(client, seeded["discarded"], verdict="true_positive", severity="critical",
                  note="Chave valida no ambiente de producao.")

    assert resp.status_code == 200
    body = resp.json()
    assert body["final_verdict"] == "true_positive"
    assert body["final_severity"] == "critical"
    # o que a IA sugeriu continua registrado, pra auditoria
    assert body["ai_verdict"] == "false_positive"
    assert body["reviewed_at"] is not None


def test_relatorio_e_remontado_com_a_decisao_humana_sem_chamar_a_ia(client, seeded):
    review(client, seeded["discarded"], verdict="true_positive", severity="critical",
           note="Chave valida no ambiente de producao.")

    md = report_md(client, seeded["scan"])
    confirmed_section = md[md.index("## Achados confirmados"):md.index("## Precisa de revisão")]
    assert "CRITICAL · Chave descartada pela IA" in confirmed_section
    assert "revisado pelo profissional; a IA sugeriu false_positive" in md
    assert "**Nota do profissional:** Chave valida no ambiente de producao." in md
    assert AI_SUMMARY in md
    assert "escrito pela IA antes da revisão do profissional" in md
    assert "2 confirmado(s), 0 para revisão e 0 falso(s) positivo(s). 1 achado(s) revisado(s)" in md
    summary = client.get(f"/api/scans/{seeded['scan']}/report").json()
    assert summary["ai_model_used"] == "gemini-teste"


def test_profissional_descarta_achado_confirmado_e_ele_aparece_nos_descartados(client, seeded):
    review(client, seeded["confirmed"], verdict="false_positive", note="Chave de teste revogada.")

    md = report_md(client, seeded["scan"])
    discarded_section = md[md.index("## Descartados como falso positivo"):md.index("## Limitações")]
    assert "Chave confirmada pela IA" in discarded_section
    assert "descartado por: profissional · motivo: Chave de teste revogada." in discarded_section
    assert "Chave descartada pela IA" in discarded_section
    assert "descartado por: IA · motivo: Parece um placeholder." in discarded_section


def test_confirmar_sem_severidade_usa_a_da_ia(client, seeded):
    body = review(client, seeded["confirmed"], verdict="true_positive").json()
    assert body["final_severity"] == "high"


def test_confirmar_sem_severidade_nenhuma_e_recusado(client, seeded):
    resp = review(client, seeded["discarded"], verdict="true_positive")
    assert resp.status_code == 400
    assert "severidade" in resp.json()["detail"]


@pytest.mark.parametrize("verdict", ["needs_review", "pending"])
def test_revisao_so_aceita_confirmar_ou_descartar(client, seeded, verdict):
    assert review(client, seeded["confirmed"], verdict=verdict).status_code == 400


def test_desfazer_revisao_volta_para_a_sugestao_da_ia(client, seeded):
    review(client, seeded["confirmed"], verdict="false_positive")
    resp = client.delete(f"/api/findings/{seeded['confirmed']}/review")

    body = resp.json()
    assert resp.status_code == 200
    assert body["final_verdict"] == "true_positive"
    assert body["final_severity"] == "high"
    assert body["human_verdict"] is None
    assert "revisado pelo profissional" not in report_md(client, seeded["scan"])


def test_filtros_da_lista_usam_a_decisao_final(client, seeded):
    review(client, seeded["discarded"], verdict="true_positive", severity="critical")
    scan = seeded["scan"]

    confirmed = client.get(f"/api/scans/{scan}/findings", params={"verdict": "true_positive"}).json()
    critical = client.get(f"/api/scans/{scan}/findings", params={"severity": "critical"}).json()
    fp = client.get(f"/api/scans/{scan}/findings", params={"verdict": "false_positive"}).json()

    assert {f["id"] for f in confirmed} == {seeded["discarded"], seeded["confirmed"]}
    assert [f["id"] for f in critical] == [seeded["discarded"]]
    assert fp == []


def test_historico_do_dominio_conta_pela_decisao_final(client, seeded):
    review(client, seeded["discarded"], verdict="true_positive", severity="critical")

    summary = client.get("/api/domains/1/scans").json()[0]
    assert summary["findings"] == 2
    assert summary["by_severity"] == {"critical": 1, "high": 1}


def test_revisar_antes_do_relatorio_existir_nao_quebra(session_factory, client, seeded):
    db = session_factory()
    db.query(Report).delete()
    db.commit()
    db.close()

    assert review(client, seeded["confirmed"], verdict="false_positive").status_code == 200


def test_achado_inexistente(client):
    assert review(client, 999, verdict="false_positive").status_code == 404
    assert client.delete("/api/findings/999/review").status_code == 404


def test_rebuild_sem_relatorio_devolve_none(session_factory, seeded):
    db = session_factory()
    db.query(Report).delete()
    db.commit()
    assert rebuild_report(db, db.get(ScanJob, seeded["scan"])) is None
    db.close()


def test_relatorio_sem_revisao_nao_mostra_aviso(session_factory, seeded):
    db = session_factory()
    scan = db.get(ScanJob, seeded["scan"])
    findings = db.query(Finding).filter(Finding.scan_job_id == scan.id).all()
    md = render_report(scan.domain, findings, summary=AI_SUMMARY)
    assert "antes da revisão do profissional" not in md
    assert "revisado(s) pelo profissional" not in md
    db.close()

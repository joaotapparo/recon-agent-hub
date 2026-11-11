import socket
from datetime import UTC, datetime
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
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
from app.services.ai_triage.report_builder import render_report
from app.services.ai_triage.report_pdf import render_report_pdf


def _pdf_text(pdf: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)


def _report(markdown: str) -> Report:
    return Report(scan_job_id=1, domain_id=1, markdown_content=markdown, ai_model_used="none",
                  generated_at=datetime.now(UTC).replace(tzinfo=None))


def test_pdf_tem_o_relatorio_com_acentos_e_sem_secret():
    finding = Finding(
        category=FindingCategory.EXPOSED_SECRET,
        source_tool="regex",
        title="Credencial exposta no checkout",
        target="https://example.com/app.js",
        raw_evidence={"password": "SyntheticPassword!42", "context": "x=1;" * 80},
        ai_verdict=AIVerdict.TRUE_POSITIVE,
        ai_severity=Severity.HIGH,
        ai_reasoning="Credencial em arquivo público.",
        ai_reproduction_steps="Abrir o arquivo JS.",
        ai_remediation="Rotacionar a credencial.",
    )
    markdown = render_report(Domain(name="example.com", authorized=True), [finding])

    pdf = render_report_pdf(_report(markdown))

    text = _pdf_text(pdf)
    assert pdf.startswith(b"%PDF")
    assert "Relatório de segurança" in text
    assert "Credencial exposta no checkout" in text
    assert "Correção" in text
    assert "SyntheticPassword!42" not in text


def test_pdf_nao_busca_url_nem_le_arquivo_local(monkeypatch):
    # o xhtml2pdf engole erro de imagem, entao registra a tentativa em vez de lancar
    lookups = []
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, *args, **kwargs: lookups.append(host) or [])
    markdown = '# Relatório\n\n<img src="https://example.org/x.png"> <img src="file:///etc/passwd">\n'

    assert render_report_pdf(_report(markdown)).startswith(b"%PDF")
    assert lookups == []


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        domain = Domain(name="example.com", authorized=True)
        job = ScanJob(domain=domain)
        db.add(job)
        db.flush()
        db.add(Report(scan_job_id=job.id, domain_id=domain.id,
                      markdown_content="# Relatório\n\nconteúdo", ai_model_used="none"))
        db.add(ScanJob(domain=domain))
        db.commit()
    app.dependency_overrides[get_db] = lambda: factory().__enter__()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_endpoint_baixa_o_pdf_do_relatorio(client):
    resp = client.get("/api/scans/1/report.pdf")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert 'filename="relatorio-scan-1.pdf"' in resp.headers["content-disposition"]
    assert "conteúdo" in _pdf_text(resp.content)


def test_endpoint_pdf_sem_relatorio_ou_scan_da_404(client):
    assert client.get("/api/scans/2/report.pdf").status_code == 404
    assert client.get("/api/scans/99999/report.pdf").status_code == 404

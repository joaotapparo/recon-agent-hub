from unittest.mock import Mock

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Report
from app.services.ai_triage import gemini_provider
from demo_ai_report import run_demo


def test_demo_offline_gera_arquivo_e_persiste_sem_chamar_gemini(tmp_path, monkeypatch):
    client = Mock(side_effect=AssertionError("a demo offline não pode chamar a API"))
    monkeypatch.setattr(gemini_provider.genai, "Client", client)

    result = run_demo(tmp_path)

    markdown = (tmp_path / "relatorio.md").read_text(encoding="utf-8")
    assert "DEMONSTRAÇÃO" in markdown
    assert "MOCK offline" in markdown
    assert "CRITICAL" in markdown
    assert "Precisa de revisão" in markdown
    assert "DemoPassword!2026" not in markdown
    assert "exemplo.com" not in markdown
    assert "**Alvo:** https://demo.recon.test/checkout.js" in markdown
    assert result["model"] == "mock"
    assert result["persisted"]
    client.assert_not_called()
    engine = create_engine(f"sqlite:///{tmp_path / 'demo.db'}")
    with Session(engine) as db:
        assert db.query(Report).one().ai_model_used == "mock"
    engine.dispose()


def test_repetir_sintese_reutiliza_achados_e_preserva_primeiro_arquivo(tmp_path):
    run_demo(tmp_path)
    original = (tmp_path / "relatorio.md").read_text(encoding="utf-8")

    result = run_demo(tmp_path, retry_summary=True)

    assert result["triage_reused"]
    assert (tmp_path / "relatorio.md").read_text(encoding="utf-8") == original
    assert (tmp_path / "relatorio-resumo.md").is_file()
    engine = create_engine(f"sqlite:///{tmp_path / 'demo.db'}")
    with Session(engine) as db:
        assert db.query(Report).count() == 1
    engine.dispose()

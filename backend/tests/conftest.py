"""Configuracao comum dos testes."""

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def _sem_chaves_reais_de_ia(monkeypatch):
    """
    Os testes nunca chamam a IA de verdade: as chaves do .env de quem roda os
    testes sao apagadas aqui. Teste que precisa de chave define a sua.
    """
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "")

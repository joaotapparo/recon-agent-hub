"""Deteccao de subdomain takeover (RF04, teste C4 da secao 12.3.1).

O DNS e a resposta HTTP sao simulados: estes testes validam a regra de
decisao, nao a deteccao contra um dominio real na internet.
"""

import pytest

from app.services.recon import takeover_check

GITHUB_ERROR = "<h1>404</h1><p>There isn't a GitHub Pages site here.</p>"


@pytest.fixture
def cname(monkeypatch):
    """Define o CNAME que o DNS 'responde' para o host testado."""
    value = {"target": None}
    monkeypatch.setattr(takeover_check, "_resolve_cname", lambda host: value["target"])
    return value


def test_cname_para_servico_removido_e_pagina_de_erro_sinaliza_takeover(cname):
    cname["target"] = "loja.github.io"
    result = takeover_check.check_takeover("blog.loja.com.br", {"body": GITHUB_ERROR})
    assert result == {"cname": "loja.github.io", "is_candidate": True, "fingerprint": "github-pages"}


def test_site_funcionando_no_servico_nao_e_takeover(cname):
    cname["target"] = "loja.github.io"
    result = takeover_check.check_takeover("blog.loja.com.br", {"body": "<h1>Blog da Loja</h1>"})
    assert result["is_candidate"] is False


def test_404_generico_sem_cname_do_servico_nao_e_takeover(cname):
    # "404 Not Found" e a assinatura da Cargo Collective, mas tambem o 404 padrao do nginx
    result = takeover_check.check_takeover("api.loja.com.br", {"body": "<h1>404 Not Found</h1><hr>nginx"})
    assert result["is_candidate"] is False


def test_host_sem_cname_nao_e_takeover(cname):
    result = takeover_check.check_takeover("loja.com.br", {"body": "<h1>Loja</h1>"})
    assert result == {"cname": None, "is_candidate": False, "fingerprint": None}

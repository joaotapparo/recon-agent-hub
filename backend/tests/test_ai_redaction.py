import copy
import json

import pytest

from app.models import Finding, FindingCategory
from app.services.ai_triage.prompt_templates import build_triage_prompt, redact_evidence


@pytest.mark.parametrize("key", ["password", "token", "Secret"])
@pytest.mark.parametrize("secret", ["abc123!", "x", "a+b[1]"])
def test_mascara_valor_curto_em_campo_sensivel(key, secret):
    evidence = {key: secret, "context": f'const credential = "{secret}";'}

    redacted = redact_evidence(evidence)

    assert redacted[key] == "<redacted>"
    assert redacted["context"] == 'const credential = "<redacted>";'


@pytest.mark.parametrize("label", ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY"])
@pytest.mark.parametrize("field", ["secret", "context"])
@pytest.mark.parametrize("closed", [True, False])
def test_prompt_remove_corpo_pem_inclusive_quando_truncado(label, field, closed):
    body = "QUJDREVGR0hJSktMTU5PUA=="
    pem = f"-----BEGIN {label}-----\n{body}\n"
    if closed:
        pem += f"-----END {label}-----"
    finding = Finding(
        category=FindingCategory.EXPOSED_SECRET,
        source_tool="regex",
        title="Possivel chave privada",
        target="https://example.com/app.js",
        raw_evidence={field: pem},
    )

    prompt = build_triage_prompt(finding)

    assert body not in prompt
    assert "<redacted>" in prompt
    assert finding.raw_evidence[field] == pem


@pytest.mark.parametrize(
    "context, secret",
    [
        ('const config = {"password": "DemoPass!2026"};', "DemoPass!2026"),
        ("const config = {'password': 'Demo Pass!2026'};", "Demo Pass!2026"),
        (r'const config = {"password": "demo\"senha!2026"};', r"demo\"senha!2026"),
        ('const password = "abc";', "abc"),
        ("https://example.com/?token=abc&lang=pt", "abc"),
        ("postgres://admin:abc123!@db.example.com:5432/prod", "abc123!"),
    ],
)
def test_mascara_valor_embutido_preservando_contexto(context, secret):
    assert redact_evidence(context) == context.replace(secret, "<redacted>")


def test_valor_completo_tem_prioridade_sobre_prefixo_reconhecido():
    prefix = "AKIA0000000000000000"
    tail = "FICTITIOUS_TAIL"
    secret = f"{prefix}:{tail}"
    finding = Finding(
        category=FindingCategory.EXPOSED_SECRET,
        source_tool=secret,
        title=f"Credencial {secret}",
        target=f"https://example.com/?credential={secret}",
        raw_evidence={"match": secret, "context": prefix},
    )

    prompt = build_triage_prompt(finding)

    assert prefix not in prompt
    assert tail not in prompt
    assert "Ferramenta de origem: <redacted>" in prompt
    assert "Titulo: Credencial <redacted>" in prompt
    assert "Alvo: https://example.com/?credential=<redacted>" in prompt


def test_mascara_lista_aninhada_sem_alterar_evidencia_original():
    evidence = {"items": [{"password": "abc123!"}], "context": "login(abc123!)"}
    original = copy.deepcopy(evidence)

    redacted = redact_evidence(evidence)

    assert "abc123!" not in json.dumps(redacted)
    assert evidence == original


def test_preserva_url_e_metadados_sem_credenciais():
    evidence = {
        "url": "https://example.com/app.js?v=42&lang=pt",
        "line": 10,
        "context": 'fetch("/api/items");',
        "details": None,
    }

    assert redact_evidence(evidence) == evidence

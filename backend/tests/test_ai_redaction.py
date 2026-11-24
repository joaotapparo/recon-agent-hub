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

    prompt = build_triage_prompt([finding])

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

    prompt = build_triage_prompt([finding])

    assert prefix not in prompt
    assert tail not in prompt
    assert '"source_tool": "<redacted>"' in prompt
    assert '"title": "Credencial <redacted>"' in prompt
    assert '"target": "https://example.com/?credential=<redacted>"' in prompt


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


@pytest.mark.parametrize(
    "value",
    [
        "aws-access-key-id",  # nome de regra do gitleaks
        "stripe-access-token",
        "X-Content-Type-Options",  # nome de cabecalho de seguranca
        "Strict-Transport-Security",
        "recon-lab-site.onrender.com",  # dominio
        "ip-172-31-23-214.ec2.internal",
    ],
)
def test_nomes_tecnicos_nao_sao_mascarados(value):
    evidence = {"rule": value, "missing": [value], "target": value}
    assert redact_evidence(evidence) == evidence


def test_hash_do_arquivo_nao_e_mascarado():
    sha = "604b3f1d2c9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f0b92"
    evidence = {"js_sha256": sha, "sha256": sha}
    assert redact_evidence(evidence) == evidence


@pytest.mark.parametrize(
    "secret",
    [
        "Xk9pT2wQs8vLm3nR4bZy",  # token aleatorio solto
        "wJalrXUtnFEMI2K7MDENGbPxRfiCYEXAMPLEKEY",
        "3c1f8e2a9d4b7c6e5f0a1b2c3d4e9e0b",
    ],
)
def test_texto_aleatorio_com_letras_e_digitos_continua_mascarado(secret):
    # valor solto num campo qualquer (segredos dentro de codigo ja chegam
    # mascarados pelo js_scanner e pelos padroes conhecidos)
    redacted = redact_evidence({"leaked": secret, "list": [secret]})
    assert secret not in str(redacted)


def test_relatorio_mostra_quais_cabecalhos_faltam():
    evidence = {"missing": ["Content-Security-Policy", "Permissions-Policy"], "rule": "aws-access-token"}
    text = str(redact_evidence(evidence))
    assert "Content-Security-Policy" in text and "Permissions-Policy" in text
    assert "aws-access-token" in text and "<redacted" not in text

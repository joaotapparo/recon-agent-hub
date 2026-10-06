"""
Demo da triagem por IA (Sprint 2 - issues #16/#17).

Manda alguns achados de exemplo pelo provider real do Gemini e mostra o veredito.
Com --mock roda offline (nao gasta cota nem depende de rede), util pra apresentar
mesmo se o modelo estiver sobrecarregado.

    uv run python demo_ai_triage.py
    uv run python demo_ai_triage.py --mock
"""

import argparse
import asyncio
import json

import httpx
from google.genai.errors import APIError
from pydantic import ValidationError

from app.models import AIVerdict, Finding, FindingCategory, Severity
from app.services.ai_triage.base import TriageResult

# Valor sintetico para a demo, sem nenhuma credencial de uma conta real.
STRIPE_EXAMPLE_KEY = "sk_live_" + "A" * 24

CASOS = [
    (
        "Placeholder oficial da AWS (deve virar falso positivo)",
        Finding(
            category=FindingCategory.EXPOSED_SECRET,
            source_tool="gitleaks",
            title="Possivel chave AWS exposta em bundle JS",
            target="exemplo.com/app.js",
            raw_evidence={
                "match": "AKIAIOSFODNN7EXAMPLE",
                "context": 'const k="AKIAIOSFODNN7EXAMPLE";',
            },
        ),
    ),
    (
        "Placeholder de documentacao (deve virar falso positivo)",
        Finding(
            category=FindingCategory.EXPOSED_SECRET,
            source_tool="regex",
            title="Token de exemplo na documentacao",
            target="exemplo.com/docs.js",
            raw_evidence={
                "match": "your-api-key-here",
                "context": '// use "your-api-key-here" no header',
            },
        ),
    ),
    (
        "Chave Stripe ficticia no front-end (cenario de risco)",
        Finding(
            category=FindingCategory.EXPOSED_SECRET,
            source_tool="regex",
            title="Chave Stripe live exposta no front-end",
            target="exemplo.com/checkout.js",
            raw_evidence={
                "match": STRIPE_EXAMPLE_KEY,
                "context": f'stripe.setKey("{STRIPE_EXAMPLE_KEY}")',
            },
        ),
    ),
]


class _MockProvider:
    """Respostas fixas so pra demo offline."""

    async def triage(self, finding: Finding) -> TriageResult:
        if "Stripe" in finding.title:
            return TriageResult(
                verdict=AIVerdict.TRUE_POSITIVE,
                severity=Severity.CRITICAL,
                confidence=0.95,
                reasoning="Prefixo sk_live_ indica chave secreta de producao exposta no front-end.",
                reproduction_steps="1. Abrir exemplo.com/checkout.js\n2. Procurar por sk_live_...",
                remediation="Revogar a chave no painel do Stripe e usar apenas a chave publica no front.",
            )
        return TriageResult(
            verdict=AIVerdict.FALSE_POSITIVE,
            severity=None,
            confidence=1.0,
            reasoning="Valor de exemplo/placeholder conhecido, sem risco real.",
        )


async def _rodar(provider, casos) -> None:
    for descricao, finding in casos:
        print(f"\n>>> {descricao}")
        try:
            resultado = await provider.triage(finding)
        except (APIError, httpx.HTTPError, TimeoutError, ValidationError, RuntimeError) as exc:
            # Falhas da API ou respostas invalidas nao interrompem os demais casos da demo.
            print(f"    [indisponivel agora: {type(exc).__name__}] - tenta de novo ou rode com --mock")
            continue

        print(
            json.dumps(
                {
                    "verdict": resultado.verdict.value,
                    "severity": resultado.severity.value if resultado.severity else None,
                    "confidence": resultado.confidence,
                    "reasoning": resultado.reasoning,
                    "reproduction_steps": resultado.reproduction_steps,
                    "remediation": resultado.remediation,
                },
                ensure_ascii=False,
                indent=2,
            )
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mock", action="store_true", help="roda offline, sem chamar a API")
    args = parser.parse_args()

    if args.mock:
        provider = _MockProvider()
        print("modo: MOCK (offline)")
    else:
        from app.services.ai_triage import get_triage_provider

        provider = get_triage_provider()
        print("modo: Gemini real")

    asyncio.run(_rodar(provider, CASOS))


if __name__ == "__main__":
    main()

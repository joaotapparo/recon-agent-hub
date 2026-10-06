import json
import re

from app.models import Finding

_SECRET_SHAPE = re.compile(r"^[A-Za-z0-9_\-\.=+/]+$")

_SECRET_KEYS = {
    "match",
    "secret",
    "value",
    "token",
    "api_key",
    "apikey",
    "api-key",
    "password",
    "passwd",
    "senha",
    "credential",
}
_SECRET_ASSIGNMENT = (
    r"""(?i:\b(?:password|passwd|senha|secret|token|api[_-]?key))['"]?\s*[:=]\s*"""
)

_SECRET_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"ya29\.[A-Za-z0-9_\-]+"),
    re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"),
    re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?"
        r"(?:-----END [A-Z ]*PRIVATE KEY-----|$)"
    ),
    re.compile(r"[A-Za-z][A-Za-z0-9_.+\-]*:(?P<secret>[^\s/@]+)@[A-Za-z0-9.\-]+"),
    re.compile(_SECRET_ASSIGNMENT + r'"(?P<secret>(?:\\.|[^"\\])*)"'),
    re.compile(_SECRET_ASSIGNMENT + r"'(?P<secret>(?:\\.|[^'\\])*)'"),
    re.compile(_SECRET_ASSIGNMENT + r"""(?P<secret>[^\s"',;<>}&)\]]+)"""),
]

_SYSTEM_PROMPT = (
    "Voce e um analista de seguranca ofensiva revisando achados extraidos "
    "automaticamente de um dominio que o usuario confirmou ter autorizacao para "
    "testar.\n\n"
    "Decida se o achado abaixo e um falso positivo (ruido comum: chave de exemplo, "
    "placeholder, valor publico, endpoint benigno) ou um achado real que representa "
    "risco. Depois:\n"
    "- classifique a severidade como info, low, medium, high ou critical;\n"
    "- use verdict=needs_review quando o contexto nao for suficiente pra decidir sem "
    "chutar;\n"
    "- preencha reproduction_steps e remediation apenas para achados reais;\n"
    "- informe uma confianca de 0 a 1 na sua decisao.\n"
)


def build_triage_prompt(finding: Finding) -> str:
    redacted = redact_evidence(
        {
            "source_tool": finding.source_tool,
            "title": finding.title,
            "target": finding.target,
            "raw_evidence": finding.raw_evidence,
        }
    )
    evidence = json.dumps(redacted["raw_evidence"], ensure_ascii=False, indent=2)
    return (
        f"{_SYSTEM_PROMPT}\n"
        f"Categoria: {finding.category.value}\n"
        f"Ferramenta de origem: {redacted['source_tool']}\n"
        f"Titulo: {redacted['title']}\n"
        f"Alvo: {redacted['target']}\n"
        f"Evidencia:\n{evidence}\n"
    )


def redact_evidence(evidence: object) -> object:
    secrets = _collect_secrets(evidence)
    if not secrets:
        return evidence
    pattern = re.compile(
        "|".join(re.escape(secret) for secret in sorted(secrets, key=len, reverse=True))
    )
    return _redact(evidence, pattern)


def _collect_secrets(node: object) -> set[str]:
    if isinstance(node, dict):
        found: set[str] = set()
        for key, value in node.items():
            if str(key).lower() in _SECRET_KEYS and isinstance(value, str) and value:
                found.add(value)
            else:
                found |= _collect_secrets(value)
        return found
    if isinstance(node, list):
        return (
            set().union(*(_collect_secrets(item) for item in node)) if node else set()
        )
    if isinstance(node, str):
        found = {node} if _looks_like_secret(node) else set()
        for pattern in _SECRET_PATTERNS:
            for match in pattern.finditer(node):
                secret = match.groupdict().get("secret", match.group(0))
                if secret:
                    found.add(secret)
        return found
    return set()


def _redact(node: object, pattern: re.Pattern[str]) -> object:
    if isinstance(node, dict):
        return {key: _redact(value, pattern) for key, value in node.items()}
    if isinstance(node, list):
        return [_redact(item, pattern) for item in node]
    if isinstance(node, str):
        return pattern.sub(lambda match: _mask(match.group(0)), node)
    return node


def _looks_like_secret(value: str) -> bool:
    return len(value) >= 16 and bool(_SECRET_SHAPE.match(value))


def _mask(value: str) -> str:
    if not _looks_like_secret(value):
        return "<redacted>"
    return f"{value[:4]}...{value[-4:]}<redacted {len(value)} chars>"

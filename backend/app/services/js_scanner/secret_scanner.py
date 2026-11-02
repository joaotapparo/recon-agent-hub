"""
js_scanner/secret_scanner.py - deteccao de candidatos a secret (RF07, issue #13).

Roda o `gitleaks` contra o diretorio de JS baixados. Se o binario nao
estiver instalado, cai num regex reduzido (modo DEGRADADO, logado como
warning) com os padroes mais comuns do gitleaks/TruffleHog.

A evidencia persistida e sempre MASCARADA (prefixo/sufixo + tamanho): o
valor bruto do secret nunca vai pro banco, pra API nem pro prompt da IA.
O relatorio bruto do gitleaks (que tem o valor em claro) e apagado depois
do parse.
"""

import asyncio
import json
import logging
import math
import re
from dataclasses import dataclass, field

from app.config import settings
from app.core.subprocess_runner import ToolError, run_tool
from app.services.js_scanner.downloader import JsFile

logger = logging.getLogger(__name__)

_CONTEXT_CHARS = 80


@dataclass(frozen=True)
class SecretCandidate:
    rule: str
    file: JsFile
    line: int
    masked_secret: str
    context: str
    entropy: float
    detector: str
    extra: dict = field(default_factory=dict)

    def evidence(self) -> dict:
        return {
            "rule": self.rule,
            "detector": self.detector,
            "js_url": self.file.url,
            "js_sha256": self.file.sha256,
            "line": self.line,
            "masked_secret": self.masked_secret,
            "context": self.context,
            "entropy": round(self.entropy, 2),
            **self.extra,
        }


# Subconjunto dos padroes do gitleaks/TruffleHog - so pro modo degradado.
_FALLBACK_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("aws-access-key-id", re.compile(r"\b((?:AKIA|ASIA)[0-9A-Z]{16})\b")),
    ("gcp-api-key", re.compile(r"\b(AIza[0-9A-Za-z_\-]{35})\b")),
    ("github-token", re.compile(r"\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b")),
    ("slack-token", re.compile(r"\b(xox[baprs]-[A-Za-z0-9-]{10,})\b")),
    ("slack-webhook", re.compile(r"(https://hooks\.slack\.com/services/[A-Za-z0-9/_\-]{20,})")),
    ("stripe-key", re.compile(r"\b((?:sk|rk)_live_[A-Za-z0-9]{20,})\b")),
    ("jwt", re.compile(r"\b(eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})\b")),
    ("private-key", re.compile(r"(-----BEGIN [A-Z ]*PRIVATE KEY-----)")),
    (
        "generic-api-key",
        re.compile(
            r"""(?i)(?:api[_-]?key|secret|token|passw(?:or)?d|client[_-]?secret|auth)['"]?\s*[:=]\s*['"]([A-Za-z0-9_\-+/=.]{16,})['"]"""
        ),
    ),
]

# generic-api-key casa muito nome de variavel/hash de build: exige entropia minima
_GENERIC_MIN_ENTROPY = 3.5


def mask_secret(value: str) -> str:
    if len(value) < 12:
        return f"<redacted {len(value)} chars>"
    return f"{value[:4]}...{value[-4:]} <redacted {len(value)} chars>"


def shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = {char: value.count(char) for char in set(value)}
    return -sum(c / len(value) * math.log2(c / len(value)) for c in counts.values())


def masked_context(text: str, start: int, end: int, secret: str) -> str:
    """Trecho em volta do match (JS minificado e uma linha so) com o secret mascarado."""
    snippet = text[max(0, start - _CONTEXT_CHARS):end + _CONTEXT_CHARS]
    return " ".join(snippet.replace(secret, mask_secret(secret)).split())


def scan_with_regex(files: list[JsFile]) -> list[SecretCandidate]:
    candidates: list[SecretCandidate] = []
    seen: set[tuple[str, str]] = set()
    for js in files:
        for rule, pattern in _FALLBACK_RULES:
            for match in pattern.finditer(js.content):
                secret = match.group(1)
                entropy = shannon_entropy(secret)
                if rule == "generic-api-key" and entropy < _GENERIC_MIN_ENTROPY:
                    continue
                if (js.sha256, secret) in seen:
                    continue
                seen.add((js.sha256, secret))
                candidates.append(SecretCandidate(
                    rule=rule,
                    file=js,
                    line=js.content.count("\n", 0, match.start()) + 1,
                    masked_secret=mask_secret(secret),
                    context=masked_context(js.content, match.start(1), match.end(1), secret),
                    entropy=entropy,
                    detector="regex-fallback",
                ))
    return candidates


async def scan_with_gitleaks(files: list[JsFile], scan_job_id: int) -> list[SecretCandidate]:
    """Levanta ToolError se o gitleaks falhar ou nao estiver instalado."""
    js_dir = files[0].path.parent
    report_path = js_dir.parent / "gitleaks-report.json"
    await run_tool(
        [
            settings.gitleaks_path, "detect", "--no-git", "--no-banner",
            "--source", str(js_dir),
            "--report-format", "json", "--report-path", str(report_path),
            "--exit-code", "0",
        ],
        scan_job_id=scan_job_id,
        tool="gitleaks",
    )
    try:
        raw = await asyncio.to_thread(report_path.read_text)
    except OSError as exc:
        raise ToolError(f"gitleaks nao gerou o relatorio: {exc}") from exc
    finally:
        # o relatorio do gitleaks tem o secret em claro - nao deixa em disco
        report_path.unlink(missing_ok=True)

    by_name = {js.path.name: js for js in files}
    candidates: list[SecretCandidate] = []
    for leak in json.loads(raw or "[]"):
        js = by_name.get(leak.get("File", "").rsplit("/", 1)[-1])
        secret = leak.get("Secret") or ""
        if js is None or not secret:
            continue
        index = js.content.find(secret)
        context = (
            masked_context(js.content, index, index + len(secret), secret)
            if index >= 0
            else " ".join(leak.get("Match", "").replace(secret, mask_secret(secret)).split())
        )
        candidates.append(SecretCandidate(
            rule=leak.get("RuleID", "desconhecida"),
            file=js,
            line=leak.get("StartLine", 0),
            masked_secret=mask_secret(secret),
            context=context,
            entropy=leak.get("Entropy") or shannon_entropy(secret),
            detector="gitleaks",
            extra={"rule_description": leak.get("Description")},
        ))
    return candidates


async def find_secrets(files: list[JsFile], scan_job_id: int) -> list[SecretCandidate]:
    if not files:
        return []
    try:
        return await scan_with_gitleaks(files, scan_job_id)
    except ToolError:
        logger.warning(
            "gitleaks indisponivel no scan %s - usando regex reduzido (modo degradado)",
            scan_job_id,
            exc_info=True,
        )
        return await asyncio.to_thread(scan_with_regex, files)

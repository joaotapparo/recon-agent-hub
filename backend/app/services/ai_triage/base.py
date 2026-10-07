from dataclasses import dataclass
from typing import Protocol

from app.models import AIVerdict, Domain, Finding, Severity


@dataclass(frozen=True)
class TriageResult:
    verdict: AIVerdict
    confidence: float
    reasoning: str
    severity: Severity | None = None
    reproduction_steps: str | None = None
    remediation: str | None = None


class AITriageProvider(Protocol):
    async def triage(self, finding: Finding) -> TriageResult: ...

    async def generate_report(
        self, domain: Domain, findings: list[Finding], *, language: str = "pt-BR"
    ) -> str: ...

from dataclasses import dataclass
from typing import Protocol

from app.models import AIVerdict, Finding, Severity


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

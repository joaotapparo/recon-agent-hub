import asyncio
import json
import logging
import re
from datetime import UTC, datetime
from html import escape

import httpx
from google.genai.errors import APIError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIVerdict, Domain, Finding, Report, ScanJob, Severity
from app.services.ai_triage.prompt_templates import (
    finding_payload,
    redact_evidence,
    validate_report_language,
)

logger = logging.getLogger(__name__)


def _confirmed(finding: Finding) -> bool:
    return (
        finding.ai_verdict == AIVerdict.TRUE_POSITIVE
        and finding.ai_severity is not None
    )


def _groups(findings: list[Finding]) -> tuple[list[Finding], list[Finding]]:
    confirmed = [f for f in findings if _confirmed(f)]
    review = [
        f
        for f in findings
        if not _confirmed(f) and f.ai_verdict != AIVerdict.FALSE_POSITIVE
    ]
    order = list(reversed(Severity))
    confirmed.sort(key=lambda f: order.index(f.ai_severity))
    return confirmed, review


def report_summary(findings: list[Finding]) -> str:
    confirmed = sum(_confirmed(finding) for finding in findings)
    discarded = sum(f.ai_verdict == AIVerdict.FALSE_POSITIVE for f in findings)
    review = len(findings) - confirmed - discarded
    return f"{confirmed} confirmado(s), {review} para revisão e {discarded} falso(s) positivo(s)."


def _text(value: str) -> str:
    return re.sub(r"([\\`*_\[\]#])", r"\\\1", escape(value))


def _block(value: object) -> str:
    content = (
        value
        if isinstance(value, str)
        else json.dumps(value, ensure_ascii=False, indent=2)
    )
    fence = "`" * max(
        3, 1 + max((len(run) for run in re.findall(r"`+", content)), default=0)
    )
    return f"{fence}text\n{content}\n{fence}"


def _redact_summary(content: str, findings: list[Finding]) -> str:
    redacted = redact_evidence(
        {
            "content": content,
            "evidence": [finding.raw_evidence for finding in findings],
        }
    )
    return redacted["content"]


def render_report(
    domain: Domain,
    findings: list[Finding],
    *,
    summary: str | None = None,
    language: str = "pt-BR",
    fallback: bool = False,
) -> str:
    validate_report_language(language)
    confirmed, review = _groups(findings)
    parts = [
        "# Relatório de segurança",
        f"Domínio: {_text(domain.name)}",
        "## Resumo executivo",
        report_summary(findings),
    ]
    if not findings:
        parts.append("Nenhum achado disponível para este scan.")
    if summary:
        parts.append(_text(_redact_summary(summary, findings)))
    if fallback:
        parts.append(
            "Síntese automática indisponível. Relatório montado com os dados disponíveis."
        )

    for heading, items in [
        ("Achados confirmados", confirmed),
        ("Precisa de revisão", review),
    ]:
        parts.append(f"## {heading}")
        if not items:
            parts.append("Nenhum achado nesta seção.")
        for finding in items:
            data = finding_payload(finding)
            title = _text(" ".join(data["title"].splitlines()))
            severity = (
                finding.ai_severity.value.upper() if _confirmed(finding) else "REVISÃO"
            )
            parts.extend(
                [
                    f"### {severity} · {title}",
                    f"**Alvo:** {_text(data['target'])}",
                    f"**Categoria:** {finding.category.value} · **Origem:** {_text(data['source_tool'])}",
                    f"**Veredito:** {finding.ai_verdict.value}",
                    "**Análise:** "
                    + _text(data["reasoning"] or "Sem análise conclusiva disponível."),
                    "#### Evidência",
                    _block(data["raw_evidence"]),
                ]
            )
            if _confirmed(finding):
                for label, field in [
                    ("Reprodução", "reproduction_steps"),
                    ("Correção", "remediation"),
                ]:
                    parts.extend(
                        [
                            f"#### {label}",
                            _block(data[field] or "Não informado na triagem."),
                        ]
                    )

    parts.extend(
        [
            "## Limitações",
            (
                "A análise considera apenas os dados coletados neste scan. "
                "Este relatório não comprova ausência de vulnerabilidades e não substitui revisão humana."
            ),
        ]
    )
    return "\n\n".join(parts) + "\n"


def load_scan_findings(
    db: Session, scan_job: ScanJob, *, pending_only: bool = False
) -> tuple[Domain, list[Finding]]:
    domain = db.get(Domain, scan_job.domain_id)
    if domain is None or not domain.authorized:
        raise ValueError("o dominio precisa estar autorizado para usar o modulo de IA")
    query = db.query(Finding).filter(
        Finding.scan_job_id == scan_job.id, Finding.domain_id == domain.id
    )
    if pending_only:
        query = query.filter(Finding.ai_verdict == AIVerdict.PENDING)
    return domain, query.order_by(Finding.id).all()


async def generate_report(
    db: Session, scan_job: ScanJob, *, language: str = "pt-BR"
) -> Report:
    from app.services.ai_triage import get_triage_provider

    validate_report_language(language)
    domain, findings = await asyncio.to_thread(load_scan_findings, db, scan_job)
    model = "none"
    markdown = render_report(domain, findings, language=language)
    if any(f.ai_verdict != AIVerdict.FALSE_POSITIVE for f in findings):
        try:
            markdown = await get_triage_provider().generate_report(
                domain, findings, language=language
            )
            if not markdown.strip():
                raise RuntimeError("o provider devolveu um relatorio vazio")
            model = settings.gemini_model
        except (
            APIError,
            httpx.HTTPError,
            TimeoutError,
            ValidationError,
            RuntimeError,
            ValueError,
        ) as exc:
            logger.warning(
                "síntese indisponível no scan %s (%s)", scan_job.id, type(exc).__name__
            )
            markdown = render_report(domain, findings, language=language, fallback=True)
    return await asyncio.to_thread(
        _save_report, db, scan_job, findings, markdown, model
    )


def _save_report(
    db: Session, scan_job: ScanJob, findings: list[Finding], markdown: str, model: str
) -> Report:
    report = db.query(Report).filter(Report.scan_job_id == scan_job.id).one_or_none()
    if report is None:
        report = Report(scan_job_id=scan_job.id, domain_id=scan_job.domain_id)
        db.add(report)
    report.summary = report_summary(findings)
    report.markdown_content = markdown
    report.ai_model_used = model
    report.generated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(report)
    return report

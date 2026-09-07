"""
Servico Agente de IA (dono: outra pessoa do time)
Requisitos: RF10, RF11, RF12, RF13, RF17

Contrato esperado pelo pipeline (app/workers/pipeline.py):

    triage_findings(db: Session, scan_job: ScanJob) -> None

Deve, para cada `Finding` vinculado a `scan_job` com
`ai_verdict == AIVerdict.PENDING`:
1. Classificar como falso positivo ou achado real usando `raw_evidence`
   como contexto, via Gemini (settings.gemini_api_key / settings.gemini_model
   ja configurados em app/config.py) (RF10, RF11).
2. Preencher `ai_verdict` (TRUE_POSITIVE / FALSE_POSITIVE / NEEDS_REVIEW).
3. Estimar `ai_severity` para os achados confirmados como reais (RF12).
4. Preencher `ai_reasoning`, `ai_reproduction_steps` e `ai_remediation`.
5. Gerar o relatorio final (RF13) e persistir como `Report`
   (import de app.models) vinculado a `scan_job.id` / `scan_job.domain_id`
   (campos: summary, markdown_content, ai_model_used).
6. Manter um conjunto de casos de teste conhecidos (achados reais e falsos
   positivos) para medir periodicamente a taxa de acerto da validacao
   (RF17) - pode virar testes em backend/tests/.
"""

from sqlalchemy.orm import Session

from app.models import ScanJob


def triage_findings(db: Session, scan_job: ScanJob) -> None:
    raise NotImplementedError(
        "Servico Agente de IA ainda nao implementado - ver docstring deste arquivo."
    )

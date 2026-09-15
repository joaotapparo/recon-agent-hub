"""
Servico Codigo Web (dono: outra pessoa do time)
Requisitos: RF05, RF06, RF07, RF08, RF09

Ver tambem as issues #11-#15 no GitHub - elas quebram esse modulo em
arquivos separados (discovery.py, downloader.py, secret_scanner.py,
endpoint_extractor.py) em vez de um so scan_hosts() aqui. Esse contrato
abaixo e o ponto de integracao esperado pelo orchestrator
(app/services/orchestrator.py), que ainda NAO chama esse modulo (fase-1
so cobre o recon) - a integracao entra numa fase-2, seguindo o mesmo
padrao da issue #20 (integracao do ai_triage na fase-3):

    async def scan_hosts(db: Session, scan_job: ScanJob, live_hosts: list[str]) -> None

Deve, para cada host em `live_hosts`:
1. Baixar os arquivos JS das paginas ativas (RF05).
2. Extrair endpoints/rotas ocultas via regex (RF06).
3. Extrair candidatos a secrets via regex/gitleaks (RF07)
   - settings.gitleaks_path ja esta configurado em app/config.py.
4. Checar arquivos sensiveis conhecidos (.env, config.json, .git/config...)
   contra uma lista tipo SecLists (RF08).
5. Persistir os achados como `Finding` (import de app.models), vinculados a
   `scan_job.id` / `scan_job.domain_id` / `subdomain_id` correspondente:
   - candidatos a secret/endpoint -> category=EXPOSED_SECRET ou
     EXPOSED_ENDPOINT, ai_verdict=AIVerdict.PENDING (a IA valida depois).
   - arquivo sensivel exposto -> achado critico direto (RF09): pode setar
     category=MISCONFIGURATION, ai_verdict=AIVerdict.TRUE_POSITIVE,
     ai_severity=Severity.CRITICAL sem esperar o modulo de IA.
"""

from sqlalchemy.orm import Session

from app.models import ScanJob


async def scan_hosts(db: Session, scan_job: ScanJob, live_hosts: list[str]) -> None:
    raise NotImplementedError(
        "Servico Codigo Web ainda nao implementado - ver docstring deste arquivo e as issues #11-#15."
    )

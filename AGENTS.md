# recon-agent-hub — guia para quem (ou qual IA) for implementar os próximos módulos

Este arquivo existe pra qualquer pessoa (ou agente de IA) que for continuar o
projeto sem ter acompanhado o histórico de decisões. Leia isto antes de
escrever código.

Escopo completo do projeto: `../Escopo_Projeto (2).docx` (fora deste repo,
na pasta `pi6/`). Requisitos funcionais RF01-RF17 vêm de lá. **O roadmap
técnico detalhado vive nas [Issues do GitHub](https://github.com/joaotapparo/recon-agent-hub/issues)**,
organizadas em fases (`fase-0-scaffolding` até `fase-5-hardening`) — este
arquivo é um resumo do estado atual, as issues são a fonte de verdade pra
granularidade fina (nome exato de arquivo, assinatura de função).

## Contexto do produto

Plataforma de recon e triagem de segurança para bug bounty: o usuário
informa um domínio, o sistema enumera subdomínios/portas/riscos de
takeover, baixa JS em busca de secrets/endpoints expostos, manda os
candidatos pra um agente de IA validar (falso positivo x real + severidade)
e gera um relatório final num painel.

⚠️ **Restrição de segurança que atravessa o projeto todo**: só se pode
escanear domínios com `Domain.authorized = True`, e a submissão passa por
uma validação anti-SSRF (`app/core/ssrf_guard.py`) que bloqueia domínios
que resolvem pra IP privado/loopback/link-local. Qualquer código novo que
toque em recon, scraping ou triagem deve respeitar isso.

## Arquitetura e convenções já estabelecidas

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0 (estilo tipado
  `Mapped`/`mapped_column`, ver `app/models/`), Alembic para migração,
  gerenciador de pacotes **`uv`** (não pip/poetry) — `cd backend && uv sync`.
- **Tudo assíncrono**: wrappers de ferramenta externa, orquestração e fila
  de jobs usam `async`/`await` (`asyncio.create_subprocess_exec`, não
  `subprocess.run` bloqueante) — necessário porque a fila de jobs
  (`app/workers/job_runner.py`) roda dentro do mesmo event loop do FastAPI.
  **Não introduza chamada bloqueante síncrona de I/O dentro de uma
  `async def`** (isso trava o event loop inteiro, ninguém mais consegue
  usar a API enquanto um scan roda) — se precisar, use
  `asyncio.to_thread(...)`.
- **Banco**: SQLite (`backend/data/recon.db`). `backend/data/` tem
  `.gitignore` que ignora tudo por padrão, com exceções explícitas
  (`!scans/.gitkeep`, `!takeover_fingerprints.json`) — se adicionar um novo
  arquivo estático que precisa ir pro git, adicione a exceção no
  `.gitignore` também, ou ele não vai ser commitado silenciosamente.
- **Sem Celery/Redis.** Fila de jobs in-process com `asyncio.Queue` +
  `asyncio.Semaphore(settings.max_concurrent_scans)`, consumida por uma
  task iniciada no `lifespan` do FastAPI (ver `app/workers/job_runner.py`
  e `app/main.py`). `settings.max_concurrent_scans` (default 1) limita
  quantos scans rodam ao mesmo tempo.
- **IA**: Google Gemini (`google-genai`), não Anthropic/OpenAI — chave em
  `settings.gemini_api_key` / `settings.gemini_model` (`app/config.py`).
- **Frontend**: Next.js 16 + React 19 + Tailwind + React Query +
  `react-markdown` (já instalado, pensado pra renderizar o relatório final).
- **Ferramentas externas** (precisam estar no PATH, caminho configurável em
  `app/config.py`): `subfinder`, `httpx` (ProjectDiscovery), `nmap`,
  `gitleaks`.
- **Padrão de wrapper de ferramenta externa**: todo wrapper em
  `app/tool_wrappers/` usa o helper assíncrono `app/core/subprocess_runner.py`
  (`await run_tool(cmd, scan_job_id=..., tool=..., input=None, timeout=...)`),
  que levanta `ToolError` se a ferramenta falhar (binário ausente, timeout,
  código de saída != 0) e salva o stdout bruto em
  `data/scans/{scan_job_id}/{tool}.json` (auditoria/debug).
  **Não engula essas exceções silenciosamente** — deixe subir até o
  orchestrator (`app/services/orchestrator.py`), que marca a `ScanJob` como
  `FAILED` com `error_message` preenchido. Se uma falha for esperada
  por-host (não por-domínio inteiro), trate localmente como o
  `_scan_ports` de `app/services/orchestrator.py` faz com o nmap.
- **Logging**: usar `logging.getLogger(__name__)`, não `print`. Falhas que
  não devem abortar o pipeline (ex.: erro de DNS num host isolado) devem
  pelo menos gerar `logger.warning(...)`, nunca ser silenciadas sem rastro.

## Estado atual — o que já está pronto

| Peça | Arquivo(s) | Status |
|---|---|---|
| Modelos do banco (Domain, ScanJob, Subdomain, Finding, Report) | `app/models/` | ✅ pronto |
| Config, database, app FastAPI base | `app/config.py`, `app/database.py`, `app/main.py` | ✅ pronto |
| Migração inicial | `backend/alembic/versions/` | ✅ pronto |
| Executor de subprocesso assíncrono (issue #5) | `app/core/subprocess_runner.py` | ✅ pronto |
| Validação de formato + anti-SSRF (issue #9) | `app/core/domain_validation.py`, `app/core/ssrf_guard.py` | ✅ pronto — hardening extra (redirect/DNS rebinding) é a issue #26, ainda não feita |
| **Módulo Infraestrutura** (RF02, RF03, RF04 — issues #2, #3, #4, #8) | `app/tool_wrappers/subfinder.py`, `httpx_cli.py`, `nmap.py`, `app/services/recon/takeover_check.py` | ✅ implementado e revisado |
| Fila de jobs + recuperação de órfãos (issues #6, #27) | `app/workers/job_runner.py` | ✅ pronto |
| Orquestração do pipeline (issue #7) | `app/services/orchestrator.py` | ✅ pronto — cobre só a fase de recon (fase-1); integração com js_scanner/ai_triage ainda não existe |
| Endpoints de domínio/scan (RF01, RF15, RF16 — issues #9, #10) | `app/routers/domains.py`, `app/routers/scans.py`, `app/schemas/domain.py`, `app/schemas/scan.py` | ✅ pronto |
| **Módulo Código Web** (RF05-RF09 — issues #11-#15) | `app/services/js_scanner/__init__.py` | 🔲 stub — `NotImplementedError` |
| **Módulo Agente de IA** (RF10-RF13, RF17 — issues #16-#21) | `app/services/ai_triage/__init__.py` | 🔲 stub — `NotImplementedError` |
| Painel/frontend (issues #22-#25) | `frontend/app/page.tsx` | 🔲 só placeholder |
| `docker-compose` opcional (issue #30) | — | 🔲 não implementado, fase-5, não bloqueante |

> **Branch**: esse trabalho está na branch `feature/infra-recon-module`,
> ainda não mergeada na `main`. Confira se já foi mergeada antes de basear
> trabalho novo nela.

> **Não testado em execução real** — foi escrito sem `uv`, `subfinder`,
> `httpx` ou `nmap` disponíveis no ambiente onde foi feito. Só validado por
> `py_compile` e revisão de código. Rode e valide antes de confiar 100%,
> principalmente:
> - os nomes de campos do JSON do `httpx` usados em
>   `app/services/orchestrator.py` (`input`/`host`, `a`, `tech`);
> - a flag `-include-response` e o campo `response`/`body` usados em
>   `app/tool_wrappers/httpx_cli.py` e `app/services/recon/takeover_check.py`
>   pra comparação de corpo HTTP no takeover check — conferir contra
>   `httpx -h` e ajustar se o nome mudou de versão.

### Como rodar

```bash
cd backend
uv sync
cp .env.example .env   # preencher GEMINI_API_KEY quando for usar o módulo de IA
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

```bash
curl -X POST http://localhost:8000/api/domains \
  -H "Content-Type: application/json" \
  -d '{"name": "dominio-de-teste-autorizado.com", "authorization_confirmed": true}'
# -> {"domain_id": 1, "scan_job_id": 1}

curl http://localhost:8000/api/scans/1        # status do scan
curl http://localhost:8000/api/domains        # lista de domínios + status do último scan
curl http://localhost:8000/api/domains/1      # detalhe de um domínio
curl -X POST http://localhost:8000/api/domains/1/rescan   # re-escanear domínio já autorizado
```

## O que falta implementar

### Módulo Código Web — `app/services/js_scanner/`

Requisitos: RF05, RF06, RF07, RF08, RF09. Issues #11-#15 (quebram isso em
`discovery.py`, `downloader.py`, `secret_scanner.py`,
`endpoint_extractor.py` + endpoint `GET /api/scans/{id}/findings`).

Contrato de integração esperado pelo `app/services/orchestrator.py`
(ainda não chamado de lá — a integração é trabalho futuro, mesmo padrão
da issue #20 pro `ai_triage`):

```python
async def scan_hosts(db: Session, scan_job: ScanJob, live_hosts: list[str]) -> None
```

Deve, para cada host em `live_hosts`:

1. Baixar os arquivos JS das páginas ativas (RF05) — `requests` +
   `BeautifulSoup` (já nas dependências do projeto).
2. Extrair endpoints/rotas ocultas via regex nos arquivos JS (RF06) —
   inspirar em LinkFinder.
3. Extrair candidatos a secrets via regex/gitleaks (RF07) —
   `settings.gitleaks_path` já está configurado.
4. Checar arquivos sensíveis conhecidos (`.env`, `config.json`,
   `.git/config`, etc.) contra uma lista tipo SecLists (RF08).
5. Persistir tudo como `Finding` (import de `app.models`), vinculado a
   `scan_job.id` / `scan_job.domain_id` / `subdomain_id` do
   `Subdomain` correspondente (já existe, criado pelo módulo
   Infraestrutura):
   - secret/endpoint → `category=FindingCategory.EXPOSED_SECRET` ou
     `EXPOSED_ENDPOINT`, `ai_verdict=AIVerdict.PENDING` (a IA valida depois).
   - arquivo sensível exposto → achado crítico direto (RF09):
     `category=FindingCategory.MISCONFIGURATION`,
     `ai_verdict=AIVerdict.TRUE_POSITIVE`, `ai_severity=Severity.CRITICAL`,
     **sem** esperar o módulo de IA.

Padrão a seguir pros novos wrappers (ex.: gitleaks): mesmo esquema
assíncrono de `app/core/subprocess_runner.py` usado pelo módulo de
Infraestrutura — não reinventar tratamento de erro nem virar síncrono.

### Módulo Agente de IA — `app/services/ai_triage/`

Requisitos: RF10, RF11, RF12, RF13, RF17. Issues #16-#21 (`base.py` com a
interface `AITriageProvider`, `gemini_provider.py`, `prompt_templates.py`,
`report_builder.py`, integração no orchestrator, endpoint
`GET /api/scans/{id}/report`).

Contrato de integração esperado:

```python
async def triage_findings(db: Session, scan_job: ScanJob) -> None
```

Chamado (quando integrado — issue #20) depois do módulo Código Web. Deve,
para cada `Finding` de `scan_job` com `ai_verdict == AIVerdict.PENDING`:

1. Classificar como falso positivo ou achado real usando `raw_evidence`
   como contexto, via Gemini (RF10, RF11).
2. Preencher `ai_verdict` (`TRUE_POSITIVE` / `FALSE_POSITIVE` /
   `NEEDS_REVIEW`).
3. Estimar `ai_severity` pros achados confirmados como reais (RF12).
4. Preencher `ai_reasoning`, `ai_reproduction_steps` e `ai_remediation`.
5. Gerar o relatório final (RF13) e persistir como `Report`, vinculado a
   `scan_job.id`/`scan_job.domain_id` (campos: `summary`,
   `markdown_content`, `ai_model_used`). O frontend já tem
   `react-markdown` instalado pra renderizar.
6. Manter um conjunto de casos de teste conhecidos pra medir a taxa de
   acerto da validação (RF17) — pode virar testes em `backend/tests/`.

### Painel — `frontend/` (issues #22-#25)

Requisitos: RF01 (via API), RF14, RF15, RF16 (via API).

API já disponível:
- `POST /api/domains` — body `{"name": str, "authorization_confirmed": bool}`.
  Retorna `{"domain_id": int, "scan_job_id": int}`. Bloqueia (400) se
  `authorization_confirmed` não vier `true`, ou se o domínio resolver pra
  IP privado (anti-SSRF) — reflita a confirmação explícita na UI.
- `GET /api/scans/{id}` — status atual (`ScanStatus`: `pending`,
  `enumerating`, `probing`, `port_scanning`, `checking_takeover`,
  `scanning_js`, `triaging`, `completed`, `failed`) + `subdomains` +
  `findings` quando disponíveis.
- `GET /api/domains` — lista de domínios com status do último scan
  (`latest_scan_status`) — RF16.
- `GET /api/domains/{id}` — detalhe de um domínio.
- `POST /api/domains/{id}/rescan` — dispara novo scan pra domínio já
  autorizado.

TODO:
1. `lib/api.ts` — client HTTP tipado pra essa API (issue #22).
2. Form de submissão de domínio com checkbox de autorização (RF01, issue #23).
3. Lista de domínios/scans (issue #24), fazendo polling em
   `GET /api/scans/{id}` pra status em andamento (RF15).
4. Página de detalhe do domínio — overview/findings/report (RF14, issue #25)
   — depende do módulo Agente de IA existir (`Report.markdown_content`).

## Tabela de rastreabilidade RF → código

| RF | Descrição | Onde está / vai estar |
|---|---|---|
| RF01 | Usuário informa domínio | `app/routers/domains.py::submit_domain` ✅ |
| RF02 | Enumerar subdomínios | `app/tool_wrappers/subfinder.py` ✅ |
| RF03 | Portas abertas / hosts ativos | `app/tool_wrappers/nmap.py`, `httpx_cli.py` ✅ |
| RF04 | Risco de subdomain takeover | `app/services/recon/takeover_check.py` ✅ |
| RF05 | Baixar JS das páginas | `app/services/js_scanner/` 🔲 |
| RF06 | Extrair endpoints do JS | `app/services/js_scanner/` 🔲 |
| RF07 | Candidatos a secrets | `app/services/js_scanner/` 🔲 |
| RF08 | Arquivos sensíveis expostos | `app/services/js_scanner/` 🔲 |
| RF09 | Arquivo sensível = achado crítico direto | `app/services/js_scanner/` 🔲 |
| RF10 | Enviar candidatos pra IA | `app/services/ai_triage/` 🔲 |
| RF11 | IA classifica falso positivo x real | `app/services/ai_triage/` 🔲 |
| RF12 | IA estima severidade | `app/services/ai_triage/` 🔲 |
| RF13 | Gerar relatório técnico | `app/services/ai_triage/` 🔲 |
| RF14 | Painel mostra tudo | `frontend/` 🔲 |
| RF15 | Acompanhamento de status | `app/routers/scans.py` ✅ (API) / `frontend/` 🔲 (UI) |
| RF16 | Histórico no banco | `app/routers/domains.py::list_domains` ✅ |
| RF17 | Casos de teste da IA | `backend/tests/` 🔲 |

# recon-agent-hub — guia para quem (ou qual IA) for implementar os próximos módulos

Este arquivo existe pra qualquer pessoa (ou agente de IA) que for continuar o
projeto sem ter acompanhado o histórico de decisões. Leia isto antes de
escrever código.

Escopo completo do projeto: `../Escopo_Projeto (2).docx` (fora deste repo,
na pasta `pi6/`). Requisitos funcionais RF01-RF17 e divisão de módulos
vêm de lá — este arquivo é o "estado atual da implementação", não substitui
o escopo.

## Contexto do produto

Plataforma de recon e triagem de segurança para bug bounty: o usuário
informa um domínio, o sistema enumera subdomínios/portas/riscos de
takeover, baixa JS em busca de secrets/endpoints expostos, manda os
candidatos pra um agente de IA validar (falso positivo x real + severidade)
e gera um relatório final num painel.

⚠️ **Restrição de segurança que atravessa o projeto todo**: só se pode
escanear domínios com `Domain.authorized = True`. Isso já é reforçado no
schema e no router de scans — qualquer código novo que toque em recon,
scraping ou triagem deve respeitar essa flag, nunca escanear um domínio
não autorizado.

## Arquitetura e convenções já estabelecidas

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0 (estilo tipado
  `Mapped`/`mapped_column`, ver `app/models/`), Alembic para migração,
  gerenciador de pacotes **`uv`** (não pip/poetry) — `cd backend && uv sync`.
- **Banco**: SQLite (`backend/data/recon.db`). `backend/data/` tem
  `.gitignore` que ignora tudo por padrão — **não coloque arquivos de dados
  estáticos lá** (ex.: fixtures, listas de fingerprints); eles não vão pro
  git. Coloque dentro de `app/` mesmo (ver exemplo em
  `app/tool_wrappers/takeover_fingerprints.json`).
- **Sem Celery/Redis.** Tarefas em background rodam via `BackgroundTasks`
  do próprio FastAPI (ver `app/routers/scans.py`). `settings.max_concurrent_scans`
  (default 1) é a única proteção contra concorrência — respeite esse limite
  se adicionar novos jeitos de disparar scans.
- **IA**: Google Gemini (`google-genai`), não Anthropic/OpenAI — chave em
  `settings.gemini_api_key` / `settings.gemini_model` (`app/config.py`).
- **Frontend**: Next.js 16 + React 19 + Tailwind + React Query +
  `react-markdown` (já instalado, pensado pra renderizar o relatório final).
- **Ferramentas externas** (precisam estar no PATH, caminho configurável em
  `app/config.py`): `subfinder`, `httpx` (ProjectDiscovery), `nmap`,
  `gitleaks`.
- **Padrão de wrapper de ferramenta externa**: todo wrapper em
  `app/tool_wrappers/` usa o helper `app/tool_wrappers/_subprocess.py`
  (`run_tool(cmd, input=None, timeout=...)`), que levanta `RuntimeError` se
  a ferramenta falhar (binário ausente, timeout, código de saída != 0).
  **Não engula essas exceções silenciosamente** — deixe subir até o
  worker (`app/workers/pipeline.py`), que marca a `ScanJob` como `FAILED`
  com `error_message` preenchido. Se uma falha for esperada por-host (não
  por-domínio), trate localmente como o `_scan_ports` de
  `app/services/recon/__init__.py` faz.
- **Logging**: usar `logging.getLogger(__name__)`, não `print`. Falhas que
  não devem abortar o pipeline (ex.: erro de DNS num host isolado) devem
  pelo menos gerar `logger.warning(...)`, nunca ser silenciadas sem rastro.

## Estado atual — o que já está pronto

| Peça | Arquivo(s) | Status |
|---|---|---|
| Modelos do banco (Domain, ScanJob, Subdomain, Finding, Report) | `app/models/` | ✅ pronto |
| Config, database, app FastAPI base | `app/config.py`, `app/database.py`, `app/main.py` | ✅ pronto |
| Migração inicial | `backend/alembic/versions/` | ✅ pronto |
| **Módulo Infraestrutura** (RF02, RF03, RF04) | `app/tool_wrappers/`, `app/services/recon/` | ✅ implementado e revisado |
| Pipeline/orquestração entre módulos | `app/workers/pipeline.py` | ✅ pronto (chama os stubs abaixo) |
| Endpoints de scan (RF01, RF15, RF16) | `app/routers/scans.py`, `app/schemas/scan.py` | ✅ mínimo funcional |
| **Módulo Código Web** (RF05-RF09) | `app/services/js_scanner/__init__.py` | 🔲 stub — `NotImplementedError` |
| **Módulo Agente de IA** (RF10-RF13, RF17) | `app/services/ai_triage/__init__.py` | 🔲 stub — `NotImplementedError` |
| Painel/frontend | `frontend/app/page.tsx` | 🔲 só placeholder |

> **Branch**: esse trabalho está na branch `feature/infra-recon-module`,
> ainda não mergeada na `main`. Confira se já foi mergeada antes de basear
> trabalho novo nela.

> **Não testado em execução real** — foi escrito sem `uv`, `subfinder`,
> `httpx` ou `nmap` disponíveis no ambiente onde foi feito. Só validado por
> `py_compile` e revisão de código. Rode e valide antes de confiar 100%,
> principalmente os nomes de campos do JSON do `httpx` usados em
> `app/services/recon/__init__.py` (`input`/`host`, `a`, `tech`).

### Como rodar

```bash
cd backend
uv sync
cp .env.example .env   # preencher GEMINI_API_KEY quando for usar o módulo de IA
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

```bash
curl -X POST http://localhost:8000/api/scans \
  -H "Content-Type: application/json" \
  -d '{"domain": "dominio-de-teste-autorizado.com", "authorized": true}'

curl http://localhost:8000/api/scans/1
```

## O que falta implementar

### Módulo Código Web — `app/services/js_scanner/__init__.py`

Requisitos: RF05, RF06, RF07, RF08, RF09.

Contrato exato (já documentado na docstring do arquivo, resumido aqui):

```python
def scan_hosts(db: Session, scan_job: ScanJob, live_hosts: list[str]) -> None
```

Chamado por `app/workers/pipeline.py` depois do módulo Infraestrutura, com
a lista de hostnames que responderam HTTP. Deve, para cada host:

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
   `Subdomain` correspondente (já existe em `app.models.Subdomain`,
   criado pelo módulo Infraestrutura — dá pra buscar por
   `db.query(Subdomain).filter_by(scan_job_id=scan_job.id, hostname=host)`):
   - secret/endpoint → `category=FindingCategory.EXPOSED_SECRET` ou
     `EXPOSED_ENDPOINT`, `ai_verdict=AIVerdict.PENDING` (a IA valida depois).
   - arquivo sensível exposto → achado crítico direto (RF09):
     `category=FindingCategory.MISCONFIGURATION`,
     `ai_verdict=AIVerdict.TRUE_POSITIVE`, `ai_severity=Severity.CRITICAL`,
     **sem** esperar o módulo de IA.

Padrão a seguir pros novos wrappers de ferramenta externa (ex.: gitleaks):
mesmo esquema de `app/tool_wrappers/_subprocess.py` usado pelo módulo de
Infraestrutura — não reinventar tratamento de erro.

### Módulo Agente de IA — `app/services/ai_triage/__init__.py`

Requisitos: RF10, RF11, RF12, RF13, RF17.

Contrato exato:

```python
def triage_findings(db: Session, scan_job: ScanJob) -> None
```

Chamado por `app/workers/pipeline.py` depois do módulo Código Web. Deve,
para cada `Finding` de `scan_job` com `ai_verdict == AIVerdict.PENDING`:

1. Classificar como falso positivo ou achado real usando `raw_evidence`
   como contexto, via Gemini (`settings.gemini_api_key` /
   `settings.gemini_model`, `google-genai` já nas dependências) (RF10, RF11).
2. Preencher `ai_verdict` (`TRUE_POSITIVE` / `FALSE_POSITIVE` /
   `NEEDS_REVIEW`).
3. Estimar `ai_severity` pros achados confirmados como reais (RF12).
4. Preencher `ai_reasoning`, `ai_reproduction_steps` e `ai_remediation`
   (sugestão de correção — já é um campo do model `Finding`).
5. Gerar o relatório final (RF13) e persistir como `Report` (import de
   `app.models`), vinculado a `scan_job.id`/`scan_job.domain_id`
   (campos: `summary`, `markdown_content`, `ai_model_used`). Sugestão:
   Jinja2 + WeasyPrint pra PDF (ver tabela de tecnologias do escopo), ou só
   Markdown puro pro MVP — o frontend já tem `react-markdown` instalado
   pra renderizar.
6. Manter um conjunto de casos de teste conhecidos (achados reais e falsos
   positivos) pra medir periodicamente a taxa de acerto da validação
   (RF17) — pode virar testes em `backend/tests/` usando `pytest` (já nas
   dev dependencies).

### Painel — `frontend/`

Requisitos: RF01 (via API), RF14, RF15, RF16 (via API).

API já disponível (ver `app/routers/scans.py`):
- `POST /api/scans` — body `{"domain": str, "authorized": bool}`. Retorna
  `ScanJob` com status inicial. **`authorized` precisa vir `true`** ou a
  API recusa (400) — reflita essa confirmação explícita na UI.
- `GET /api/scans/{id}` — status atual (`ScanStatus`: `pending`,
  `enumerating`, `probing`, `port_scanning`, `checking_takeover`,
  `scanning_js`, `triaging`, `completed`, `failed`) + `subdomains` +
  `findings` quando disponíveis.
- `GET /api/scans` — histórico (RF16).

TODO:
1. Form de submissão de domínio com checkbox de autorização (RF01).
2. Tela de acompanhamento fazendo polling em `GET /api/scans/{id}`,
   mostrando o `status` (RF15) — os valores de `ScanStatus` já dão passos
   granulares pra uma barra de progresso.
3. Tela final com domínio, subdomínios, achados e o relatório em Markdown
   (via `react-markdown`, RF14) — depende do módulo Agente de IA existir
   (`Report.markdown_content`).

## Tabela de rastreabilidade RF → código

| RF | Descrição | Onde está / vai estar |
|---|---|---|
| RF01 | Usuário informa domínio | `app/routers/scans.py::create_scan` ✅ |
| RF02 | Enumerar subdomínios | `app/tool_wrappers/subfinder.py` ✅ |
| RF03 | Portas abertas | `app/tool_wrappers/nmap_scan.py` ✅ |
| RF04 | Risco de subdomain takeover | `app/tool_wrappers/dns_takeover.py` ✅ |
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
| RF16 | Histórico no banco | `app/routers/scans.py::list_scans` ✅ |
| RF17 | Casos de teste da IA | `backend/tests/` 🔲 |

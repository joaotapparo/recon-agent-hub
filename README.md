# recon-agent-hub

Plataforma automatizada de recon e triagem de vulnerabilidades guiada por IA.

> Uso exclusivamente ético e autorizado: só submeta domínios para os quais você
> tem permissão explícita de teste (programa de bug bounty, pentest contratado,
> ambiente próprio). O envio de um domínio no MVP exige confirmação de
> autorização.

## Arquitetura

- `backend/` — API em Python + FastAPI, orquestra as ferramentas de recon
  (subfinder, httpx, nmap) e a triagem dos achados via IA (Gemini).
- `frontend/` — painel em Next.js/React que consome a API do backend.

O plano de implementação completo (modelo de dados, roadmap faseado, etc.)
está em desenvolvimento incremental por fases — ver histórico de commits.

## Backend

Requisitos: Python 3.11+ e [uv](https://docs.astral.sh/uv/).

```bash
cd backend
uv sync
cp .env.example .env   # preencha GEMINI_API_KEY quando chegar na fase de triagem por IA
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API disponível em `http://localhost:8000`, docs interativas em `/docs`.

### Ferramentas externas necessárias (fases seguintes)

Precisam estar no `PATH` (ou apontadas via `.env`): `subfinder`, `httpx`
(ProjectDiscovery), `nmap`, e opcionalmente `katana`, `gitleaks`, `nuclei`.

## Frontend

Requisitos: Node.js 20+.

```bash
cd frontend
npm install
npm run dev
```

Painel disponível em `http://localhost:3000`.

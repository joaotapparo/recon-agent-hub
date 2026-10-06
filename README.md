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

### Ferramentas externas necessárias

Essas ferramentas **não são bibliotecas Python** — não entram no `pyproject.toml`
nem são instaladas pelo `uv sync`. Precisam ser instaladas manualmente no
sistema e estar no `PATH` (ou apontadas via `.env`, ver `app/config.py`):

| Ferramenta | Usada por | Como instalar |
|---|---|---|
| `nmap` | módulo Infraestrutura (RF03) | `sudo apt install nmap` |
| `subfinder` | módulo Infraestrutura (RF02) | requer [Go](https://go.dev/doc/install) instalado, depois: `go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` |
| `httpx` (ProjectDiscovery) | módulo Infraestrutura (RF03) | requer Go, depois: `go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest` |
| `gitleaks` | módulo Código Web (RF07, ainda não implementado) | `go install github.com/gitleaks/gitleaks/v8@latest` ou baixar binário em [releases](https://github.com/gitleaks/gitleaks/releases) |

Depois de instalar via `go install`, confirme que `$HOME/go/bin` está no seu
`PATH` (senão os binários instalados não são encontrados):
```bash
echo 'export PATH="$HOME/go/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

Confira que tudo está acessível antes de rodar o backend:
```bash
which nmap subfinder httpx gitleaks
```

⚠️ **Armadilha confirmada na prática**: o pacote Python `httpx` (dependência
transitiva do `google-genai`, usado na triagem por IA) instala um script de
linha de comando *também* chamado `httpx` dentro do ambiente virtual do
`uv` — e esse script tem prioridade no `PATH` quando rodado via `uv run`,
na frente do binário de verdade da ProjectDiscovery. O sintoma é o scan
falhar com `httpx terminou com codigo 1` e uma mensagem pedindo
`pip install httpx[cli]`. **Corrija isso configurando `HTTPX_PATH` no
`.env` com o caminho absoluto do binário real** (rode `which httpx` antes
de ativar o ambiente do `uv`, geralmente `$HOME/go/bin/httpx`):
```bash
echo "HTTPX_PATH=$HOME/go/bin/httpx" >> backend/.env
```

## Frontend

Requisitos: Node.js 20+.

```bash
cd frontend
npm install
npm run dev
```

Painel disponível em `http://localhost:3000`.

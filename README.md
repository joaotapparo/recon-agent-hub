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

### Triagem e relatório de IA

O módulo de IA faz a triagem e gera um relatório Markdown salvo na tabela
`reports`. Ele roda dentro do scan, depois do módulo Código Web (#20), e o
relatório sai pela API em JSON, Markdown ou PDF (#21 e #32).

A triagem vai em lotes: achados da mesma categoria seguem juntos, até
`AI_TRIAGE_BATCH_SIZE` (padrão 10) por chamada. Cada resultado volta com o
`finding_id`; achado que não voltar, vier repetido ou estiver num lote que
falhou fica como `needs_review`. O tamanho do lote e o timeout ainda não foram
calibrados com o Gemini real triando em lote.

O PDF (`GET /api/scans/{id}/report.pdf`) é gerado na hora a partir do Markdown
salvo, com `xhtml2pdf` e Jinja2. Não precisa instalar nada no sistema: o
`uv sync` resolve no Mac, no Linux e no Windows. A renderização não busca URL
nem lê arquivo local.

As duas funções usam a sessão e o scan existentes, sempre de um domínio
autorizado:

```python
from app.services.ai_triage import generate_report, triage_findings

await triage_findings(db, scan_job)
report = await generate_report(db, scan_job, language="pt-BR")
```

Por enquanto, só `pt-BR` é suportado. O idioma já é um parâmetro para o front
poder informar a preferência do usuário quando outros idiomas forem adicionados.
Os nomes técnicos, URLs e comandos são preservados, exceto valores sensíveis.

`GEMINI_TEMPERATURE=1.0` mantém o padrão recomendado pelo Google para Gemini 3.x.
Confira também seu `.env`: ele tem prioridade sobre o valor padrão do código.

O Gemini escreve a síntese; o código organiza os achados confirmados por
severidade, separa os que precisam de revisão e inclui evidência, reprodução
e correção. Falsos positivos entram apenas na contagem. Secrets são mascarados
antes de sair para a IA e no relatório. Se a síntese falhar, os dados continuam
em um relatório básico com o aviso de indisponibilidade e `ai_model_used="none"`.
Um scan sem achados não é declarado seguro. Gerar novamente atualiza o relatório
do mesmo scan, sem criar outra linha no banco.

Para conferir o módulo sem usar a API do Gemini:

```bash
cd backend
uv run pytest -q
uv run python demo_ai_triage.py --mock
```

Os testes do relatório usam SQLite temporário e respostas simuladas do Gemini.
A persistência é conferida por outra sessão do banco; isso não valida a
qualidade das respostas do modelo real.

Para mostrar uma demonstração ao orientador, com dados fictícios e sem scan:

```bash
cd backend
uv run python demo_ai_report.py         # offline, sem usar a API
uv run python demo_ai_report.py --real  # Gemini real, usando somente dados fictícios
```

Cada rodada cria uma pasta própria em `backend/data/demos/`, ignorada pelo Git,
com `relatorio.md`, `validacao.json` e um SQLite `demo.db`. O banco normal do
projeto não é alterado. A demo identifica claramente resultados simulados e
permite conferir a persistência por outra sessão.

Para repetir só a síntese, sem gastar chamadas com as triagens já salvas:

```bash
uv run python demo_ai_report.py --real --retry-summary data/demos/gemini-IDENTIFICADOR
```

Isso atualiza o relatório no banco da demo e cria `relatorio-resumo.md` e
`validacao-resumo.json`, preservando os arquivos da primeira tentativa.

Na validação real de 06/10/2026, houve HTTP 503 e timeouts nas primeiras rodadas.
Com temperatura `1.0`, os três candidatos receberam respostas válidas do
`gemini-3.6-flash`, mas a síntese esgotou o timeout de 30 segundos. No teste
seguinte, apenas da síntese e com timeout temporário de 60 segundos, a segunda
tentativa concluiu. O relatório com o resumo do Gemini foi salvo e relido;
os arquivos do fallback anterior foram preservados. Isso valida geração e
persistência nesse cenário, não acurácia (RF17) nem disponibilidade contínua.

Para repetir esse teste sem mudar o `.env`:

```bash
GEMINI_TIMEOUT_SECONDS=60 uv run python demo_ai_report.py --real --retry-summary data/demos/gemini-IDENTIFICADOR
```

O timeout padrão agora é de 60 segundos e continua configurável no `.env`.

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

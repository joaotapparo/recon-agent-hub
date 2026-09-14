# Acesso à instância AWS (EC2)

Guia pra quem já recebeu uma chave `.pem` e precisa acessar a instância
compartilhada do time pra rodar/testar o projeto.

## 1. Conectar via SSH

**IP público da instância**: `3.16.255.31`
**Usuário**: `ubuntu`

Linux/Mac:
```bash
chmod 400 sua-chave.pem
ssh -i sua-chave.pem ubuntu@3.16.255.31
```

Windows (PowerShell, OpenSSH já vem embutido no Windows 10/11):
```powershell
ssh -i sua-chave.pem ubuntu@3.16.255.31
```
Se der erro de "permissões muito abertas" no Windows: botão direito no
arquivo `.pem` → Propriedades → Segurança → remova a herança e deixe só
o seu usuário com acesso.

Se der `Permission denied (publickey)`, avisa o Nicholas — sua chave
pública pode não ter sido cadastrada corretamente na instância.

## 2. Primeira vez: clonar o repositório

Dentro da instância (depois de conectar):
```bash
git clone https://github.com/joaotapparo/recon-agent-hub.git
cd recon-agent-hub
git checkout feature/infra-recon-module   # confirme com o time qual branch está valendo
```

Se já existe uma cópia do repo na instância (outra pessoa já clonou),
**não clone de novo** — só entre na pasta existente e dê `git pull`:
```bash
cd recon-agent-hub
git pull
```

## 3. Instalar as ferramentas necessárias

Isso só precisa ser feito **uma vez por instância** (não por pessoa) — se
alguém já instalou, pule esta seção e confirme com `which uv nmap subfinder httpx gitleaks`.

Passo a passo completo e atualizado está no `README.md` do repo (seção
"Ferramentas externas necessárias") e no `AGENTS.md` (contexto geral do
projeto e do que falta implementar). Resumo rápido:

```bash
# uv (gerenciador Python)
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc

# nmap
sudo apt update && sudo apt install nmap -y

# Go (necessário pro subfinder, httpx e gitleaks)
sudo apt install golang-go -y
echo 'export PATH="$HOME/go/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc

# subfinder, httpx, gitleaks
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install github.com/gitleaks/gitleaks/v8@latest

# Node.js (pro frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y
```

Confirme que tudo está no PATH:
```bash
which uv nmap subfinder httpx gitleaks node
```

## 4. Rodar o backend

```bash
cd ~/recon-agent-hub/backend
uv sync
cp .env.example .env   # só na primeira vez - preencha GEMINI_API_KEY quando for mexer no módulo de IA
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --reload
```

⚠️ Use `--host 0.0.0.0` (não o padrão `127.0.0.1`), senão a API só responde
de dentro da própria instância, ninguém de fora consegue acessar.

API acessível em: `http://3.16.255.31:8000` (docs interativas em `/docs`).

## 5. Rodar o frontend

Em outro terminal (outra sessão SSH, ou dentro de um `tmux`/`screen`, ver
seção 6):
```bash
cd ~/recon-agent-hub/frontend
npm install
npm run dev -- --hostname 0.0.0.0
```

Frontend acessível em: `http://3.16.255.31:3000`.

## 6. Importante: é uma instância COMPARTILHADA entre os 4

- **Antes de rodar `uvicorn` ou `npm run dev`, confira se alguém já não está
  rodando**, pra não dar conflito de porta:
  ```bash
  lsof -i :8000
  lsof -i :3000
  ```
  Se aparecer algo, já tem alguém usando — combine no grupo antes de matar
  o processo de outra pessoa.

- **Use `tmux` ou `screen`** pra manter o backend/frontend rodando mesmo
  depois que você desconectar do SSH (senão o processo morre quando você
  sai):
  ```bash
  tmux new -s backend
  # roda o uvicorn aqui dentro
  # Ctrl+B depois D pra sair sem matar o processo

  tmux attach -t backend   # pra voltar depois
  ```

- **Sempre dê `git pull` antes de começar a trabalhar**, e avise no grupo
  antes de dar `git push` de algo grande, pra não pisar no trabalho de
  outro módulo.

- **Nunca commite o `.env`** (já está no `.gitignore`, mas fique atento) —
  ele tem a chave da API do Gemini.

## 7. Segurança

- A chave `.pem` que você recebeu é pessoal — não repasse pra mais
  ninguém. Se você acha que ela vazou, avisa o Nicholas pra remover do
  `~/.ssh/authorized_keys` da instância.
- Só testem a ferramenta contra domínios que vocês têm autorização
  explícita pra escanear (o próprio sistema já reforça isso com o campo
  `Domain.authorized`, mas vale reforçar na prática também).

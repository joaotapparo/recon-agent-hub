"""
ai_triage/attack_chains.py - cadeias de ataque: como achados isolados se somam.

Duas fontes, mesmo formato:
- regras (sempre disponivel, sem IA): combinacoes conhecidas entre categorias
  de achado (ex.: arquivo .env exposto -> credenciais -> acesso a sistemas).
  Calculadas na hora, entao acompanham a revisao humana.
- IA (sob demanda, POST no endpoint): o provider monta as cadeias a partir dos
  achados triados. A resposta e validada (so ids que existem no scan) e fica
  em data/scans/{id}/attack_chains.json.

E narrativa sobre achados que ja existem: nada aqui executa teste novo, e a
IA e instruida a nao inventar evidencia nem passos executados.
"""

import asyncio
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIVerdict, Domain, Finding, FindingCategory, ScanJob, Severity

logger = logging.getLogger(__name__)

_ORDER = [Severity.INFO, Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
_WEB_TOOLS = {"security-headers", "cors-check", "tls-check", "email-security", "dns-security"}
STEP_KINDS = ("entry", "pivot", "impact")


@dataclass
class ChainStep:
    title: str
    description: str
    kind: str  # entry | pivot | impact
    finding_ids: list[int] = field(default_factory=list)


@dataclass
class AttackChain:
    id: str
    title: str
    impact: str
    severity: str
    steps: list[ChainStep]


@dataclass
class AttackChainSet:
    source: str  # "rules" | "ai"
    model: str | None
    generated_at: str
    chains: list[AttackChain]
    warning: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


# ── regras ────────────────────────────────────────────────────────────────


def _active(findings: list[Finding]) -> list[Finding]:
    return [f for f in findings if f.final_verdict != AIVerdict.FALSE_POSITIVE]


def _worst(findings: list[Finding], default: Severity) -> str:
    rated = [f.final_severity for f in findings if f.final_severity is not None]
    if not rated:
        return default.value
    return max(rated, key=_ORDER.index).value


def _ids(findings: list[Finding]) -> list[int]:
    return [f.id for f in findings]


def build_rule_chains(findings: list[Finding]) -> list[AttackChain]:
    active = _active(findings)
    by_tool: dict[str, list[Finding]] = {}
    by_cat: dict[FindingCategory, list[Finding]] = {}
    for f in active:
        by_tool.setdefault(f.source_tool, []).append(f)
        by_cat.setdefault(f.category, []).append(f)

    sensitive = [
        f for f in by_cat.get(FindingCategory.MISCONFIGURATION, []) if f.source_tool not in _WEB_TOOLS
    ]
    secrets = by_cat.get(FindingCategory.EXPOSED_SECRET, [])
    endpoints = by_cat.get(FindingCategory.EXPOSED_ENDPOINT, [])
    takeovers = by_cat.get(FindingCategory.SUBDOMAIN_TAKEOVER, [])
    cves = by_cat.get(FindingCategory.VULNERABLE_COMPONENT, [])
    leaks = by_cat.get(FindingCategory.CREDENTIAL_LEAK, [])
    ports = by_cat.get(FindingCategory.OPEN_PORT, [])
    cors = by_tool.get("cors-check", [])
    email = by_tool.get("email-security", [])
    tls = by_tool.get("tls-check", [])
    headers = by_tool.get("security-headers", [])

    chains: list[AttackChain] = []

    if sensitive:
        chains.append(
            AttackChain(
                id="rule-sensitive-file",
                title="Arquivo interno aberto vira chave mestra",
                impact="Senhas e configurações do servidor lidas por qualquer pessoa dão acesso direto a banco de dados e serviços internos.",
                severity=_worst(sensitive, Severity.CRITICAL),
                steps=[
                    ChainStep("Arquivo sensível público", "Um arquivo como .env, .git/config ou backup responde na internet sem login.", "entry", _ids(sensitive)),
                    ChainStep("Leitura de credenciais", "O conteúdo costuma trazer senhas de banco, chaves de API e endereços internos.", "pivot"),
                    ChainStep("Acesso aos sistemas", "Com as credenciais, o atacante entra no banco ou nos serviços como se fosse a aplicação.", "impact"),
                ],
            )
        )

    if secrets:
        steps = [ChainStep("Chave no código do site", "Uma chave de API aparece no JavaScript que qualquer navegador baixa.", "entry", _ids(secrets))]
        if endpoints:
            steps.append(ChainStep("Rotas internas mapeadas", "O mesmo código revela as rotas da API que aceitam essa chave.", "pivot", _ids(endpoints)))
        steps.append(ChainStep("Uso indevido da chave", "Terceiros chamam a API em nome da empresa: custo, dados expostos ou ações não autorizadas.", "impact"))
        chains.append(
            AttackChain(
                id="rule-secret-api",
                title="Chave vazada no JavaScript abre a API",
                impact="A chave pode ser usada por qualquer pessoa enquanto não for revogada.",
                severity=_worst(secrets + endpoints, Severity.HIGH),
                steps=steps,
            )
        )

    if cors:
        steps = [
            ChainStep("Vítima visita site malicioso", "Um cliente logado abre uma página controlada pelo atacante.", "entry"),
            ChainStep("CORS aceita qualquer origem", "O servidor deixa essa página ler as respostas da API com a sessão da vítima.", "pivot", _ids(cors)),
        ]
        if endpoints:
            steps.append(ChainStep("Rotas conhecidas", "As rotas vistas no JavaScript dizem exatamente o que pedir.", "pivot", _ids(endpoints)))
        steps.append(ChainStep("Dados do cliente lidos", "Perfil, pedidos ou tokens do usuário vão parar no servidor do atacante.", "impact"))
        chains.append(
            AttackChain(
                id="rule-cors",
                title="Site malicioso lê dados de clientes logados",
                impact="Vazamento de dados pessoais sem a vítima perceber.",
                severity=_worst(cors, Severity.HIGH),
                steps=steps,
            )
        )

    if takeovers:
        chains.append(
            AttackChain(
                id="rule-takeover",
                title="Endereço abandonado sequestrado",
                impact="Conteúdo falso servido num endereço oficial da empresa, com credibilidade total para phishing.",
                severity=_worst(takeovers, Severity.HIGH),
                steps=[
                    ChainStep("DNS aponta para serviço desativado", "Um subdomínio ainda aponta para uma conta de nuvem que não existe mais.", "entry", _ids(takeovers)),
                    ChainStep("Atacante cria o serviço", "Ele registra a mesma conta no provedor e passa a controlar o endereço.", "pivot"),
                    ChainStep("Página falsa oficial", "Login falso ou malware hospedado sob o domínio da empresa.", "impact"),
                ],
            )
        )

    if cves:
        steps = []
        cve_hosts = {f.target for f in cves}
        exposed = [p for p in ports if any(p.target in host or host in p.target for host in cve_hosts)]
        if exposed:
            steps.append(ChainStep("Serviço exposto", "A porta do serviço está aberta para a internet.", "entry", _ids(exposed)))
        disclosed = [
            f for f in headers if isinstance(f.raw_evidence, dict) and f.raw_evidence.get("disclosed_headers")
        ]
        steps += [
            ChainStep("Versão antiga identificada", "O servidor informa a versão exata do software, que tem falhas públicas.", "entry" if not exposed else "pivot", _ids(cves) + _ids(disclosed)),
            ChainStep("Exploit público", "Ferramentas automáticas procuram exatamente essa versão e aplicam ataques prontos.", "pivot"),
            ChainStep("Servidor comprometido", "Execução de código ou queda do serviço, dependendo da falha.", "impact"),
        ]
        chains.append(
            AttackChain(
                id="rule-cve",
                title="Software desatualizado com falhas conhecidas",
                impact="Indicativo: confirme a versão real (distribuições corrigem sem mudar o número).",
                severity=_worst(cves, Severity.HIGH),
                steps=steps,
            )
        )

    if email or leaks:
        steps = []
        if leaks:
            steps.append(ChainStep("Senhas vazadas", "E-mails da empresa aparecem em vazamentos de outros sites.", "entry", _ids(leaks)))
        if email:
            steps.append(ChainStep("E-mail falsificável", "Sem SPF/DMARC rígidos, dá para mandar e-mail como se fosse a empresa.", "entry" if not leaks else "pivot", _ids(email)))
        steps += [
            ChainStep("Phishing convincente", "Funcionários recebem pedido de login que parece interno.", "pivot"),
            ChainStep("Conta corporativa invadida", "Com a senha, o atacante acessa e-mail e sistemas internos.", "impact"),
        ]
        chains.append(
            AttackChain(
                id="rule-phishing",
                title="Golpe por e-mail em nome da empresa",
                impact="Fraude contra clientes e funcionários, com dano à marca.",
                severity=_worst(email + leaks, Severity.MEDIUM),
                steps=steps,
            )
        )

    if tls or headers:
        steps = []
        if tls:
            steps.append(ChainStep("Tráfego sem criptografia", "Sem HTTPS válido, a conexão pode ser lida em redes Wi-Fi públicas.", "entry", _ids(tls)))
        if headers:
            steps.append(ChainStep("Navegador sem proteções", "Faltam cabeçalhos que impedem injeção de script e clickjacking.", "pivot" if tls else "entry", _ids(headers)))
        steps.append(ChainStep("Sessão roubada", "Cookie de login capturado ou ação feita em nome do usuário.", "impact"))
        chains.append(
            AttackChain(
                id="rule-session",
                title="Sessão do usuário interceptada",
                impact="O atacante age como o cliente logado.",
                severity=_worst(tls + headers, Severity.MEDIUM),
                steps=steps,
            )
        )

    chains.sort(key=lambda c: _ORDER.index(Severity(c.severity)), reverse=True)
    return chains


# ── IA ────────────────────────────────────────────────────────────────────


def _cache_path(scan_job_id: int):
    return settings.scans_dir / str(scan_job_id) / "attack_chains.json"


def read_cached(scan_job_id: int) -> dict | None:
    path = _cache_path(scan_job_id)
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _write_cache(scan_job_id: int, data: dict) -> None:
    path = _cache_path(scan_job_id)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False))
    except OSError as exc:
        logger.warning("nao foi possivel gravar cadeias de ataque: %s", exc)


def sanitize_ai_chains(raw: list[dict], findings: list[Finding]) -> list[AttackChain]:
    """Descarta ids inexistentes e cadeias que nao citam nenhum achado real."""
    valid = {f.id for f in findings}
    chains: list[AttackChain] = []
    for i, chain in enumerate(raw):
        steps = []
        for step in chain.get("steps") or []:
            kind = step.get("kind") if step.get("kind") in STEP_KINDS else "pivot"
            ids = [fid for fid in step.get("finding_ids") or [] if fid in valid]
            title = str(step.get("title") or "").strip()
            if title:
                steps.append(ChainStep(title, str(step.get("description") or "").strip(), kind, ids))
        if len(steps) < 2 or not any(s.finding_ids for s in steps):
            continue
        try:
            severity = Severity(chain.get("severity")).value
        except ValueError:
            severity = Severity.MEDIUM.value
        chains.append(
            AttackChain(
                id=f"ai-{i}",
                title=str(chain.get("title") or "Cadeia de ataque").strip(),
                impact=str(chain.get("impact") or "").strip(),
                severity=severity,
                steps=steps,
            )
        )
    return chains


def _load(db: Session, scan_job: ScanJob) -> tuple[Domain, list[Finding]]:
    domain = db.get(Domain, scan_job.domain_id)
    if domain is None or not domain.authorized:
        raise ValueError("o dominio precisa estar autorizado")
    findings = (
        db.query(Finding).filter(Finding.scan_job_id == scan_job.id).order_by(Finding.id).all()
    )
    return domain, findings


async def current_chains(db: Session, scan_job: ScanJob) -> dict:
    """O que o painel mostra: a versao da IA, se ja gerada; senao as regras."""
    cached = await asyncio.to_thread(read_cached, scan_job.id)
    if cached:
        return cached
    _, findings = await asyncio.to_thread(_load, db, scan_job)
    return _rules_set(findings).to_dict()


def _rules_set(findings: list[Finding], warning: str | None = None) -> AttackChainSet:
    return AttackChainSet(
        source="rules",
        model=None,
        generated_at=datetime.now(UTC).isoformat(),
        chains=build_rule_chains(findings),
        warning=warning,
    )


async def generate_ai_chains(db: Session, scan_job: ScanJob) -> dict:
    from app.services.ai_triage import get_triage_provider

    domain, findings = await asyncio.to_thread(_load, db, scan_job)
    active = _active(findings)
    if not active:
        return _rules_set(findings).to_dict()
    try:
        provider = get_triage_provider()
        raw = await provider.generate_attack_chains(domain, active)
    except Exception as exc:  # IA fora do ar ou sem chave: o painel segue com as regras
        logger.warning("IA nao gerou cadeias de ataque (%s: %s)", type(exc).__name__, exc)
        return _rules_set(findings, warning=f"IA indisponível ({type(exc).__name__}); mostrando as cadeias por regra.").to_dict()

    chains = sanitize_ai_chains(raw, active)
    if not chains:
        return _rules_set(findings, warning="A IA não montou cadeias com os achados atuais; mostrando as cadeias por regra.").to_dict()
    data = AttackChainSet(
        source="ai",
        model=provider.model,
        generated_at=datetime.now(UTC).isoformat(),
        chains=chains,
    ).to_dict()
    await asyncio.to_thread(_write_cache, scan_job.id, data)
    return data

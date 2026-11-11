// Converte as respostas cruas da API (lib/api.ts) para os tipos que os
// componentes renderizam (types.ts).

import type {
  AIVerdict,
  ApiDomain,
  ApiFinding,
  ApiScanJob,
  FindingCategory,
  ScanStatus,
  Severity,
} from './api';
import { isRunning } from './api';
import type {
  AnalysisStage,
  AnalysisStatus,
  Endpoint,
  Finding,
  FindingStatus,
  FindingType,
  HistoryItem,
  OpenPort,
  ScanDataset,
  Secret,
  SensitiveFile,
  SeverityLevel,
  Subdomain,
  TakeoverRisk,
  WebConfigIssue,
} from '../types';

// O backend grava datetime em UTC sem sufixo de fuso; sem o "Z" o browser
// interpretaria como horário local.
export function parseApiDate(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return parseApiDate(value).toLocaleDateString('pt-BR');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parseApiDate(value);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function toAnalysisStatus(status: ScanStatus | null): AnalysisStatus | 'pending' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'error';
  if (status == null) return 'pending';
  return 'running';
}

export function toHistoryItem(d: ApiDomain): HistoryItem {
  return {
    id: d.id,
    scanId: d.latest_scan_id,
    domain: d.name,
    date: formatDate(d.created_at),
    status: toAnalysisStatus(d.latest_scan_status),
    needsVerification: !d.verified,
  };
}

// ── Etapas do pipeline ────────────────────────────────────────────────────

type StageDef = Omit<AnalysisStage, 'status' | 'progress'> & { statuses: ScanStatus[] };

export const STAGES: StageDef[] = [
  {
    key: 'recon',
    name: 'Reconhecimento',
    tool: 'subfinder + httpx',
    description: 'Descobre todos os endereços ligados ao domínio e quais deles estão no ar.',
    statuses: ['enumerating', 'probing'],
  },
  {
    key: 'infra',
    name: 'Infraestrutura',
    tool: 'nmap + DNS',
    description: 'Testa quais "portas" dos servidores estão abertas e se algum endereço foi abandonado.',
    statuses: ['port_scanning', 'checking_takeover'],
  },
  {
    key: 'web',
    name: 'Auditoria web',
    tool: 'headers, TLS, CORS, SPF/DMARC',
    description: 'Confere o cadeado (HTTPS), as proteções do navegador e se dá para falsificar e-mails.',
    statuses: ['web_audit'],
  },
  {
    key: 'js',
    name: 'Código JavaScript',
    tool: 'gitleaks + regex',
    description: 'Lê o código do site em busca de senhas, chaves e arquivos que não deveriam estar públicos.',
    statuses: ['scanning_js'],
  },
  {
    key: 'ai',
    name: 'IA e relatório',
    tool: 'Gemini',
    description: 'A IA separa o que é risco real do que é alarme falso e escreve o relatório.',
    statuses: ['triaging'],
  },
];

/** Explicação da etapa exata em andamento (sub-etapas do recon/infra). */
export const STATUS_EXPLAINER: Partial<Record<ScanStatus, { title: string; text: string }>> = {
  pending: { title: 'Na fila', text: 'A análise vai começar assim que o servidor estiver livre.' },
  enumerating: {
    title: 'Mapeando endereços',
    text: 'Consultando fontes públicas (certificados, buscadores, DNS) para listar todos os subdomínios. É como levantar a planta de todos os prédios de uma empresa.',
  },
  probing: {
    title: 'Batendo nas portas',
    text: 'Visitando cada endereço para ver quais sites estão realmente no ar e que tecnologia usam.',
  },
  port_scanning: {
    title: 'Testando portas',
    text: 'Verificando quais serviços cada servidor deixa expostos na internet, como checar quais janelas de um prédio estão destrancadas.',
  },
  checking_takeover: {
    title: 'Procurando endereços abandonados',
    text: 'Um subdomínio que aponta para um serviço desativado pode ser "sequestrado" por um atacante para hospedar conteúdo falso.',
  },
  web_audit: {
    title: 'Auditando a configuração',
    text: 'Conferindo o cadeado HTTPS, as proteções que o site pede ao navegador e se alguém consegue mandar e-mail em nome da empresa.',
  },
  scanning_js: {
    title: 'Lendo o código do site',
    text: 'Baixando o JavaScript público e procurando senhas, chaves de API e rotas internas esquecidas pelos desenvolvedores.',
  },
  triaging: {
    title: 'IA analisando',
    text: 'A inteligência artificial revisa cada achado, descarta alarmes falsos e estima a gravidade dos riscos reais.',
  },
  completed: { title: 'Análise concluída', text: 'Todos os testes terminaram. Veja abaixo o que foi encontrado.' },
  failed: { title: 'A análise falhou', text: 'Algo impediu a análise de terminar. Veja a mensagem de erro acima.' },
};

function stage(def: StageDef, status: AnalysisStage['status'], progress: number): AnalysisStage {
  const { statuses: _statuses, ...rest } = def;
  return { ...rest, status, progress };
}

export function toStages(status: ScanStatus): AnalysisStage[] {
  if (status === 'completed') {
    return STAGES.map((s) => stage(s, 'completed', 100));
  }
  if (status === 'pending' || status === 'failed') {
    // Em falha, a API não diz em qual etapa parou; o erro aparece no cabeçalho.
    return STAGES.map((s) => stage(s, 'pending', 0));
  }
  const current = STAGES.findIndex((s) => s.statuses.includes(status));
  return STAGES.map((s, i) => {
    if (i < current) return stage(s, 'completed', 100);
    if (i > current) return stage(s, 'pending', 0);
    const step = s.statuses.indexOf(status);
    return stage(s, 'running', Math.round(((step + 0.5) / s.statuses.length) * 100));
  });
}

// ── Achados ───────────────────────────────────────────────────────────────

// Ferramentas da Auditoria Web também gravam como misconfiguration.
const WEB_CONFIG_TOOLS = new Set(['security-headers', 'cors-check', 'tls-check', 'email-security']);

const WEB_CHECK_LABEL: Record<string, string> = {
  'security-headers': 'Cabeçalhos',
  'cors-check': 'CORS',
  'tls-check': 'HTTPS / TLS',
  'email-security': 'E-mail (SPF/DMARC)',
};

function findingType(f: ApiFinding): FindingType {
  if (f.category === 'misconfiguration' && WEB_CONFIG_TOOLS.has(f.source_tool)) return 'web_config';
  return TYPE_BY_CATEGORY[f.category];
}

const TYPE_BY_CATEGORY: Record<FindingCategory, FindingType> = {
  exposed_secret: 'secret',
  exposed_endpoint: 'endpoint',
  misconfiguration: 'sensitive_file',
  subdomain_takeover: 'takeover',
  open_port: 'open_port',
};

const STATUS_BY_VERDICT: Record<AIVerdict, FindingStatus> = {
  true_positive: 'confirmed',
  false_positive: 'false_positive',
  pending: 'analyzing',
  needs_review: 'needs_review',
};

function toSeverity(sev: Severity | null): SeverityLevel {
  return sev ?? 'unrated';
}

type Evidence = Record<string, unknown>;

function evidenceObject(raw: unknown): Evidence {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Evidence) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function fileName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { pathname } = new URL(url);
    return pathname.split('/').filter(Boolean).pop() ?? pathname;
  } catch {
    return url;
  }
}

function hostOf(url: string | undefined): string {
  if (!url) return '—';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function describe(f: ApiFinding, ev: Evidence): string {
  switch (f.category) {
    case 'exposed_secret':
      return `Possível credencial (regra "${str(ev.rule) ?? '?'}", detector ${f.source_tool}) encontrada em arquivo JavaScript público.`;
    case 'exposed_endpoint': {
      const n = Array.isArray(ev.endpoints) ? ev.endpoints.length : 0;
      return `${n} rota(s) referenciada(s) no JavaScript da aplicação. Podem revelar APIs internas ou não documentadas.`;
    }
    case 'misconfiguration':
      if (WEB_CONFIG_TOOLS.has(f.source_tool)) return describeWebConfig(f.source_tool, ev);
      return `${str(ev.description) ?? 'Arquivo sensível'} acessível publicamente (HTTP ${ev.status_code ?? '?'}).`;
    case 'subdomain_takeover':
      return `O subdomínio aponta (CNAME ${str(ev.cname) ?? '?'}) para um serviço que parece não estar mais provisionado.`;
    case 'open_port':
      return 'Portas TCP abertas detectadas pelo nmap.';
  }
}

function describeWebConfig(tool: string, ev: Evidence): string {
  switch (tool) {
    case 'security-headers': {
      if (ev.disclosed_headers) {
        return 'O servidor informa o nome e a versão exata do software que usa, o que facilita para um atacante procurar falhas conhecidas daquela versão.';
      }
      const missing = Array.isArray(ev.missing_headers)
        ? ev.missing_headers.map((h) => (h as { name?: string }).name).filter(Boolean).join(', ')
        : '';
      return `O site não pede ao navegador proteções importantes${missing ? ` (${missing})` : ''}. Elas dificultam ataques como roubo de sessão, clickjacking e injeção de scripts.`;
    }
    case 'cors-check':
      return 'O servidor aceita que qualquer outro site leia suas respostas. Uma página maliciosa poderia ler dados de um usuário logado.';
    case 'tls-check':
      if (ev.issue === 'no_https') return 'O site não tem HTTPS: tudo que o usuário envia (inclusive senhas) trafega sem criptografia.';
      if (ev.valid === false) return `O certificado HTTPS é inválido (${str(ev.error) ?? 'erro de verificação'}). O navegador mostra alerta de "site não seguro".`;
      return `O certificado HTTPS expira em ${ev.days_left ?? '?'} dia(s). Quando expirar, o site fica com alerta de "não seguro".`;
    case 'email-security': {
      const issues = Array.isArray(ev.issues) ? ev.issues.join('; ') : '';
      return `Alguém pode conseguir enviar e-mails se passando por este domínio (phishing)${issues ? `: ${issues}` : ''}.`;
    }
    default:
      return 'Configuração de segurança fraca.';
  }
}

function splitSteps(text: string | null): string[] | undefined {
  if (!text) return undefined;
  const steps = text
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim())
    .filter(Boolean);
  return steps.length ? steps : undefined;
}

export function toFinding(f: ApiFinding): Finding {
  const ev = evidenceObject(f.raw_evidence);
  const jsUrl = str(ev.js_url);
  const status = STATUS_BY_VERDICT[f.ai_verdict];
  return {
    id: String(f.id),
    severity: toSeverity(f.ai_severity),
    type: findingType(f),
    sourceTool: f.source_tool,
    title: f.title,
    target: f.target,
    file: fileName(jsUrl),
    line: typeof ev.line === 'number' ? ev.line : undefined,
    status,
    date: formatDate(f.created_at),
    aiValidation:
      f.ai_reasoning ??
      (status === 'analyzing' ? 'Aguardando triagem da IA.' : 'Sem análise da IA para este achado.'),
    description: describe(f, ev),
    evidence: f.raw_evidence == null ? undefined : JSON.stringify(f.raw_evidence, null, 2),
    reproSteps: splitSteps(f.ai_reproduction_steps),
    remediation: f.ai_remediation ?? undefined,
  };
}

// ── Dataset completo de um scan ───────────────────────────────────────────

export function toDataset(domain: ApiDomain, scan: ApiScanJob, apiFindings: ApiFinding[]): ScanDataset {
  const findings = apiFindings.map(toFinding);

  const subdomains: Subdomain[] = scan.subdomains.map((s) => ({
    host: s.hostname,
    status: s.http_status != null ? 'active' : 'inactive',
    ip: s.ip_addresses?.[0],
    ports: (s.open_ports ?? []).map((p) => p.port),
  }));

  const openPorts: OpenPort[] = scan.subdomains.flatMap((s) =>
    (s.open_ports ?? []).map((p) => ({
      host: s.hostname,
      port: p.port,
      protocol: p.protocol ?? 'tcp',
      service: p.service ?? '—',
    })),
  );

  const takeoverRisks: TakeoverRisk[] = apiFindings
    .filter((f) => f.category === 'subdomain_takeover')
    .map((f) => {
      const ev = evidenceObject(f.raw_evidence);
      return {
        subdomain: f.target,
        cname: str(ev.cname) ?? '—',
        status: str(ev.fingerprint) ?? 'candidato',
        severity: toSeverity(f.ai_severity),
      };
    });

  const endpoints: Endpoint[] = apiFindings
    .filter((f) => f.category === 'exposed_endpoint')
    .flatMap((f) => {
      const ev = evidenceObject(f.raw_evidence);
      const jsUrl = str(ev.js_url);
      const paths = Array.isArray(ev.endpoints) ? ev.endpoints.filter((e): e is string => typeof e === 'string') : [];
      return paths.map((path) => ({
        path,
        host: hostOf(jsUrl),
        file: fileName(jsUrl) ?? '—',
        status: STATUS_BY_VERDICT[f.ai_verdict],
      }));
    });

  const secrets: Secret[] = apiFindings
    .filter((f) => f.category === 'exposed_secret')
    .map((f) => {
      const ev = evidenceObject(f.raw_evidence);
      return {
        type: str(ev.rule) ?? 'secret',
        file: fileName(str(ev.js_url)) ?? '—',
        maskedValue: str(ev.masked_secret) ?? '••••',
        status: STATUS_BY_VERDICT[f.ai_verdict],
      };
    });

  const sensitiveFiles: SensitiveFile[] = apiFindings
    .filter((f) => findingType(f) === 'sensitive_file')
    .map((f) => {
      const ev = evidenceObject(f.raw_evidence);
      const url = str(ev.url) ?? f.target;
      return {
        filename: str(ev.path) ?? fileName(url) ?? url,
        host: hostOf(url),
        accessible: true,
        severity: toSeverity(f.ai_severity),
      };
    });

  const webConfig: WebConfigIssue[] = apiFindings
    .filter((f) => findingType(f) === 'web_config')
    .map((f) => ({
      host: f.source_tool === 'email-security' ? f.target : hostOf(f.target),
      check: WEB_CHECK_LABEL[f.source_tool] ?? f.source_tool,
      title: f.title,
      status: STATUS_BY_VERDICT[f.ai_verdict],
      severity: toSeverity(f.ai_severity),
    }));

  // falsos positivos não contam como achados nos números de resumo
  const relevant = findings.filter((f) => f.status !== 'false_positive');
  const count = (sev: SeverityLevel) => relevant.filter((f) => f.severity === sev).length;

  const status = toAnalysisStatus(scan.status);

  return {
    scanId: scan.id,
    domainId: domain.id,
    domain: domain.name,
    date: formatDateTime(scan.started_at ?? scan.created_at),
    status: status === 'pending' ? 'running' : status,
    errorMessage: scan.error_message,
    stats: {
      subdomains: subdomains.length,
      activeHosts: subdomains.filter((s) => s.status === 'active').length,
      openPorts: openPorts.length,
      findings: relevant.length,
      critical: count('critical'),
      high: count('high'),
      medium: count('medium'),
      low: count('low'),
    },
    stages: toStages(scan.status),
    findings,
    subdomains,
    openPorts,
    takeoverRisks,
    endpoints,
    secrets,
    sensitiveFiles,
    webConfig,
    rawStatus: scan.status,
  };
}

export { isRunning };

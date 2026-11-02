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
} from '../types';

// O backend grava datetime em UTC sem sufixo de fuso; sem o "Z" o browser
// interpretaria como horário local.
function parseApiDate(value: string): Date {
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
  };
}

// ── Etapas do pipeline ────────────────────────────────────────────────────

const STAGES: { name: string; statuses: ScanStatus[] }[] = [
  { name: 'Reconhecimento', statuses: ['enumerating', 'probing'] },
  { name: 'Infraestrutura', statuses: ['port_scanning', 'checking_takeover'] },
  { name: 'JavaScript', statuses: ['scanning_js'] },
  { name: 'IA e relatório', statuses: ['triaging'] },
];

export function toStages(status: ScanStatus): AnalysisStage[] {
  if (status === 'completed') {
    return STAGES.map((s) => ({ name: s.name, status: 'completed', progress: 100 }));
  }
  if (status === 'pending' || status === 'failed') {
    // Em falha, a API não diz em qual etapa parou; o erro aparece no cabeçalho.
    return STAGES.map((s) => ({ name: s.name, status: 'pending', progress: 0 }));
  }
  const current = STAGES.findIndex((s) => s.statuses.includes(status));
  return STAGES.map((s, i) => {
    if (i < current) return { name: s.name, status: 'completed', progress: 100 };
    if (i > current) return { name: s.name, status: 'pending', progress: 0 };
    const step = s.statuses.indexOf(status);
    const progress = Math.round(((step + 0.5) / s.statuses.length) * 100);
    return { name: s.name, status: 'running', progress };
  });
}

// ── Achados ───────────────────────────────────────────────────────────────

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
      return `${str(ev.description) ?? 'Arquivo sensível'} acessível publicamente (HTTP ${ev.status_code ?? '?'}).`;
    case 'subdomain_takeover':
      return `O subdomínio aponta (CNAME ${str(ev.cname) ?? '?'}) para um serviço que parece não estar mais provisionado.`;
    case 'open_port':
      return 'Portas TCP abertas detectadas pelo nmap.';
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
    type: TYPE_BY_CATEGORY[f.category],
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
    .filter((f) => f.category === 'misconfiguration')
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
  };
}

export { isRunning };

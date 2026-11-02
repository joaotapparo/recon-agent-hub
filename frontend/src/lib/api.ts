// Client HTTP tipado para a API do backend (issue #22).
// Em dev, o Vite faz proxy de /api para o backend (ver vite.config.ts).
// Em build, defina VITE_API_BASE_URL se o backend estiver em outra origem.

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export type ScanStatus =
  | 'pending'
  | 'enumerating'
  | 'probing'
  | 'port_scanning'
  | 'checking_takeover'
  | 'scanning_js'
  | 'triaging'
  | 'completed'
  | 'failed';

export type FindingCategory =
  | 'subdomain_takeover'
  | 'open_port'
  | 'exposed_secret'
  | 'exposed_endpoint'
  | 'misconfiguration';

export type AIVerdict = 'pending' | 'true_positive' | 'false_positive' | 'needs_review';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface ApiDomain {
  id: number;
  name: string;
  authorized: boolean;
  authorized_at: string | null;
  created_at: string;
  latest_scan_id: number | null;
  latest_scan_status: ScanStatus | null;
}

export interface ApiOpenPort {
  port: number;
  protocol: string | null;
  service: string | null;
}

export interface ApiSubdomain {
  hostname: string;
  ip_addresses: string[] | null;
  http_status: number | null;
  http_title: string | null;
  tech_stack: string[] | null;
  open_ports: ApiOpenPort[] | null;
  takeover_candidate: boolean;
  takeover_fingerprint: string | null;
}

export interface ApiScanJob {
  id: number;
  status: ScanStatus;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
  subdomains: ApiSubdomain[];
}

export interface ApiFinding {
  id: number;
  subdomain_id: number | null;
  category: FindingCategory;
  source_tool: string;
  title: string;
  target: string;
  ai_verdict: AIVerdict;
  ai_severity: Severity | null;
  ai_reasoning: string | null;
  ai_reproduction_steps: string | null;
  raw_evidence: unknown;
  ai_confidence: number | null;
  ai_remediation: string | null;
  created_at: string;
  triaged_at: string | null;
}

export interface ApiReport {
  scan_job_id: number;
  domain_id: number;
  summary: string | null;
  markdown_content: string;
  ai_model_used: string;
  generated_at: string;
}

export interface SubmitResponse {
  domain_id: number;
  scan_job_id: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar à API. O backend está rodando?');
  }
  if (!res.ok) {
    throw new ApiError(res.status, await errorDetail(res));
  }
  return res.json() as Promise<T>;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
    // erros de validação do FastAPI (422) vêm como lista
    if (Array.isArray(body?.detail)) return body.detail.map((d: { msg?: string }) => d.msg).join('; ');
  } catch {
    /* corpo não é JSON */
  }
  return `Erro ${res.status} na API`;
}

export const api = {
  listDomains: () => request<ApiDomain[]>('/api/domains'),

  submitDomain: (name: string, authorizationConfirmed: boolean) =>
    request<SubmitResponse>('/api/domains', {
      method: 'POST',
      body: JSON.stringify({ name, authorization_confirmed: authorizationConfirmed }),
    }),

  rescan: (domainId: number) =>
    request<SubmitResponse>(`/api/domains/${domainId}/rescan`, { method: 'POST' }),

  getScan: (scanId: number) => request<ApiScanJob>(`/api/scans/${scanId}`),

  getFindings: (scanId: number) => request<ApiFinding[]>(`/api/scans/${scanId}/findings`),

  getReport: (scanId: number) => request<ApiReport>(`/api/scans/${scanId}/report`),

  reportMarkdownUrl: (scanId: number) => `${BASE_URL}/api/scans/${scanId}/report.md`,
  reportPdfUrl: (scanId: number) => `${BASE_URL}/api/scans/${scanId}/report.pdf`,
};

export const RUNNING_STATUSES: ScanStatus[] = [
  'pending',
  'enumerating',
  'probing',
  'port_scanning',
  'checking_takeover',
  'scanning_js',
  'triaging',
];

export function isRunning(status: ScanStatus | null | undefined): boolean {
  return status != null && RUNNING_STATUSES.includes(status);
}

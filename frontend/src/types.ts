// Tipos de apresentação usados pelos componentes. Os tipos crus da API
// ficam em lib/api.ts; lib/adapters.ts converte de um para o outro.

/** `unrated` = achado ainda sem severidade (pendente de triagem ou sem IA). */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unrated';
export type FindingStatus = 'confirmed' | 'false_positive' | 'analyzing' | 'needs_review';
export type AnalysisStatus = 'running' | 'completed' | 'error';
export type FindingType =
  | 'secret'
  | 'endpoint'
  | 'sensitive_file'
  | 'web_config'
  | 'takeover'
  | 'open_port'
  | 'vulnerable_component'
  | 'credential_leak';

export interface FindingReview {
  note: string | null;
  date: string;
}

export interface Finding {
  id: string;
  /** id numérico na API, usado na revisão humana */
  apiId: number;
  /** decisão final: a do profissional, se ele revisou; senão a da IA */
  severity: SeverityLevel;
  type: FindingType;
  /** ferramenta que gerou o achado (ex.: tls-check, gitleaks) */
  sourceTool: string;
  title: string;
  target: string;
  file?: string;
  line?: number;
  status: FindingStatus;
  /** o que a IA sugeriu, guardado mesmo depois da revisão */
  aiStatus: FindingStatus;
  aiSeverity: SeverityLevel;
  review: FindingReview | null;
  date: string;
  aiValidation: string;
  description: string;
  evidence?: string;
  reproSteps?: string[];
  remediation?: string;
}

export interface Subdomain {
  host: string;
  status: 'active' | 'inactive';
  ip?: string;
  ports: number[];
  /** null = não verificado; "" = nenhum firewall detectado */
  waf?: string | null;
  /** tecnologias detectadas pelo httpx (ex.: "nginx:1.19.0") */
  tech: string[];
  httpStatus?: number;
  title?: string;
}

export interface OpenPort {
  host: string;
  port: number;
  protocol: string;
  service: string;
}

export interface TakeoverRisk {
  subdomain: string;
  cname: string;
  status: string;
  severity: SeverityLevel;
}

export interface Endpoint {
  path: string;
  host: string;
  file: string;
  status: FindingStatus;
}

export interface Secret {
  type: string;
  file: string;
  maskedValue: string;
  status: FindingStatus;
}

export interface SensitiveFile {
  filename: string;
  host: string;
  accessible: boolean;
  severity: SeverityLevel;
}

export interface HistoryItem {
  /** id do domínio na API */
  id: number;
  scanId: number | null;
  domain: string;
  date: string;
  status: AnalysisStatus | 'pending';
  needsVerification: boolean;
}

export interface AnalysisStage {
  key: string;
  name: string;
  /** O que a etapa faz, em linguagem simples (pra quem não é da área). */
  description: string;
  tool: string;
  status: 'completed' | 'running' | 'pending' | 'failed';
  progress: number;
}

export interface ScanStats {
  subdomains: number;
  activeHosts: number;
  openPorts: number;
  findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface WebConfigIssue {
  host: string;
  check: string;
  title: string;
  status: FindingStatus;
  severity: SeverityLevel;
}

export interface ScanDataset {
  scanId: number;
  domainId: number;
  domain: string;
  date: string;
  status: AnalysisStatus;
  errorMessage: string | null;
  stats: ScanStats;
  stages: AnalysisStage[];
  findings: Finding[];
  subdomains: Subdomain[];
  openPorts: OpenPort[];
  takeoverRisks: TakeoverRisk[];
  endpoints: Endpoint[];
  secrets: Secret[];
  sensitiveFiles: SensitiveFile[];
  webConfig: WebConfigIssue[];
  /** status cru da API, pra saber a etapa exata em andamento */
  rawStatus: string;
}

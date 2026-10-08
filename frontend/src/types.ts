export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'confirmed' | 'false_positive' | 'analyzing';
export type AnalysisStatus = 'running' | 'completed' | 'error';

export interface Finding {
  id: string;
  severity: SeverityLevel;
  type: 'secret' | 'endpoint' | 'sensitive_file' | 'takeover';
  title: string;
  target: string;
  file?: string;
  line?: number;
  status: FindingStatus;
  date: string;
  aiValidation: string;
  description: string;
  evidence?: string;
  reproSteps?: string[];
}

export interface Subdomain {
  host: string;
  status: 'active' | 'inactive';
  ip?: string;
  ports: number[];
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  host: string;
  file: string;
  aiRelevant: boolean;
}

export interface Secret {
  type: string;
  file: string;
  maskedValue: string;
  aiResult: 'real' | 'false_positive';
}

export interface SensitiveFile {
  filename: string;
  host: string;
  accessible: boolean;
  severity: SeverityLevel;
}

export interface HistoryItem {
  id: string;
  domain: string;
  date: string;
  status: AnalysisStatus;
  findingsCount?: number;
}

export interface AnalysisStage {
  name: string;
  status: 'completed' | 'running' | 'pending';
  progress: number;
}

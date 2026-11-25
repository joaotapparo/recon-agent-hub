// Liga achados aos hosts (subdomínios) e calcula o risco de cada um.
// Usado pelo grafo, pelo globo e pelo painel lateral do host.

import type { Finding, SeverityLevel, Subdomain } from '../types';
import { SEV_RANK, isIssue } from './score';

export type HostRisk = 'critical' | 'warning' | 'ok' | 'offline';

export const RISK_COLOR: Record<HostRisk, string> = {
  critical: '#f87171',
  warning: '#facc15',
  ok: '#22c55e',
  offline: '#52525b',
};

export const RISK_LABEL: Record<HostRisk, string> = {
  critical: 'Risco alto/crítico',
  warning: 'Pontos de atenção',
  ok: 'No ar, sem achados',
  offline: 'Fora do ar',
};

export const SEV_COLOR: Record<SeverityLevel, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: '#94a3b8',
  info: '#a1a1aa',
  unrated: '#71717a',
};

export function hostOf(target: string): string {
  try {
    return new URL(target).hostname;
  } catch {
    return target.split('/')[0].split(':')[0];
  }
}

/** Achados (sem falso positivo e sem "porta aberta") de um host. */
export function findingsForHost(host: string, findings: Finding[]): Finding[] {
  return findings.filter((f) => isIssue(f) && hostOf(f.target) === host);
}

export function riskFor(sub: Subdomain, findings: Finding[]): HostRisk {
  const mine = findingsForHost(sub.host, findings);
  if (mine.some((f) => f.status === 'confirmed' && SEV_RANK[f.severity] >= 4)) return 'critical';
  if (mine.length) return 'warning';
  if (sub.status === 'inactive') return 'offline';
  return 'ok';
}

export function worstSeverity(findings: Finding[]): SeverityLevel {
  return findings.reduce<SeverityLevel>(
    (worst, f) => (SEV_RANK[f.severity] > SEV_RANK[worst] ? f.severity : worst),
    'unrated',
  );
}

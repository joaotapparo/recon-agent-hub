import type { SeverityLevel, FindingStatus } from './types';

const severityMap: Record<SeverityLevel, { label: string; text: string; bg: string; border: string; dot: string }> = {
  critical: { label: 'CRÍTICO', text: 'text-crit', bg: 'bg-crit/10', border: 'border-crit/25', dot: 'bg-crit' },
  high:     { label: 'ALTO',    text: 'text-high', bg: 'bg-high/10', border: 'border-high/25', dot: 'bg-high' },
  medium:   { label: 'MÉDIO',   text: 'text-med',  bg: 'bg-med/10',  border: 'border-med/25',  dot: 'bg-med' },
  low:      { label: 'BAIXO',   text: 'text-low',  bg: 'bg-low/10',  border: 'border-low/25',  dot: 'bg-low' },
  info:     { label: 'INFO',    text: 'text-subtle', bg: 'bg-surface-2', border: 'border-border-2', dot: 'bg-subtle' },
  unrated:  { label: 'N/A',     text: 'text-muted', bg: 'bg-surface-2', border: 'border-border-2', dot: 'bg-border-2' },
};

export function getSeverity(sev: SeverityLevel) {
  return severityMap[sev];
}

export function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  const { label, text, bg, border } = severityMap[severity];
  return (
    <span
      title={severity === 'unrated' ? 'Sem severidade atribuída' : undefined}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-widest border ${text} ${bg} ${border}`}
    >
      {label}
    </span>
  );
}

export const statusMap: Record<FindingStatus, { label: string; cls: string }> = {
  confirmed:      { label: 'Confirmado',      cls: 'text-ok bg-ok/10 border-ok/20' },
  false_positive: { label: 'Falso positivo',  cls: 'text-muted bg-surface-2 border-border-2' },
  analyzing:      { label: 'Aguardando IA',   cls: 'text-accent bg-accent/10 border-accent/20' },
  needs_review:   { label: 'Revisão manual',  cls: 'text-med bg-med/10 border-med/20' },
};

export function StatusBadge({ status }: { status: FindingStatus }) {
  const { label, cls } = statusMap[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${cls}`}>
      {label}
    </span>
  );
}

export const typeLabel: Record<string, string> = {
  secret:         'Secret',
  endpoint:       'Endpoint',
  sensitive_file: 'Arquivo sensível',
  takeover:       'Subdomain Takeover',
  open_port:      'Porta aberta',
};

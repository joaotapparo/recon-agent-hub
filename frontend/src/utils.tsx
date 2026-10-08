import type { SeverityLevel, FindingStatus } from './types';

const severityMap = {
  critical: { label: 'CRÍTICO', text: 'text-crit', bg: 'bg-crit/10', border: 'border-crit/25' },
  high:     { label: 'ALTO',    text: 'text-high', bg: 'bg-high/10', border: 'border-high/25' },
  medium:   { label: 'MÉDIO',   text: 'text-med',  bg: 'bg-med/10',  border: 'border-med/25' },
  low:      { label: 'BAIXO',   text: 'text-low',  bg: 'bg-low/10',  border: 'border-low/25' },
};

export function getSeverity(sev: SeverityLevel) {
  return severityMap[sev];
}

export function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  const { label, text, bg, border } = severityMap[severity];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-widest border ${text} ${bg} ${border}`}>
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  const map = {
    confirmed:      { label: 'Confirmado',     cls: 'text-ok bg-ok/10 border-ok/20' },
    false_positive: { label: 'Falso positivo', cls: 'text-muted bg-surface-2 border-border-2' },
    analyzing:      { label: 'Em análise',     cls: 'text-accent bg-accent/10 border-accent/20' },
  };
  const { label, cls } = map[status];
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
};

export const methodColor: Record<string, string> = {
  GET:    'text-ok',
  POST:   'text-accent',
  PUT:    'text-med',
  DELETE: 'text-crit',
  PATCH:  'text-high',
};

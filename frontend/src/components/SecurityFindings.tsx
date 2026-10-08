import { useState } from 'react';
import { findings } from '../mockData';
import { SeverityBadge, StatusBadge, typeLabel } from '../utils';
import type { Finding, SeverityLevel, FindingStatus } from '../types';

function FindingPanel({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-30" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-2 border-l border-border-2 z-40 overflow-y-auto">
        <div className="sticky top-0 bg-surface-2 border-b border-border px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
              {typeLabel[finding.type]}
            </p>
            <h3 className="font-display font-600 text-lg text-foreground leading-snug">{finding.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-3 transition-colors shrink-0 mt-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-2 flex-wrap">
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Alvo', value: finding.target },
              { label: 'Data', value: finding.date },
              ...(finding.file ? [{ label: 'Arquivo', value: finding.file }] : []),
              ...(finding.line ? [{ label: 'Linha', value: `#${finding.line}` }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface border border-border rounded px-3 py-2">
                <p className="text-[10px] text-muted font-mono tracking-wide uppercase mb-0.5">{label}</p>
                <p className="text-xs font-mono text-foreground break-all">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">Descrição</p>
            <p className="text-sm text-subtle leading-relaxed">{finding.description}</p>
          </div>

          {finding.evidence && (
            <div>
              <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">Evidência</p>
              <pre className="bg-bg rounded px-3 py-2.5 text-xs font-mono text-foreground overflow-x-auto border border-border">
                {finding.evidence}
              </pre>
            </div>
          )}

          <div className="rounded border border-accent/20 bg-accent/5 px-4 py-3">
            <p className="text-[10px] font-mono text-accent tracking-widest uppercase mb-1.5">Validação da IA</p>
            <p className="text-xs text-subtle leading-relaxed">{finding.aiValidation}</p>
          </div>

          {finding.reproSteps && finding.reproSteps.length > 0 && (
            <div>
              <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">Passos de reprodução</p>
              <ol className="space-y-1.5">
                {finding.reproSteps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-subtle">
                    <span className="font-mono text-muted shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface border border-border text-xs text-subtle font-mono rounded px-2.5 py-1.5 outline-none focus:border-accent/50 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const severityDot: Record<SeverityLevel, string> = {
  critical: 'bg-crit',
  high: 'bg-high',
  medium: 'bg-med',
  low: 'bg-low',
};

interface SecurityFindingsProps {
  findingsList?: Finding[];
}

export default function SecurityFindings({ findingsList = findings }: SecurityFindingsProps) {
  const [selected, setSelected] = useState<Finding | null>(null);
  const [filterSev, setFilterSev] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = findingsList.filter((f) => {
    if (filterSev !== 'all' && f.severity !== filterSev) return false;
    if (filterType !== 'all' && f.type !== filterType) return false;
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.title.toLowerCase().includes(q) && !f.target.toLowerCase().includes(q) && !f.file?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-600 text-base text-foreground tracking-wide">Achados de Segurança</h2>
          <span className="text-[10px] font-mono text-muted bg-surface-2 border border-border px-1.5 py-0.5 rounded">
            {findingsList.length}
          </span>
        </div>
        <span className="text-[10px] font-mono text-subtle hidden sm:block">
          Exibindo {filtered.length} de {findingsList.length}
        </span>
      </div>

      <div className="px-5 py-3 border-b border-border flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1.5 flex-1 min-w-[160px] max-w-xs">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Pesquisar achado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs font-mono text-foreground outline-none placeholder:text-muted w-full"
          />
        </div>

        <Select
          value={filterSev}
          onChange={setFilterSev}
          options={[
            { value: 'all', label: 'Gravidade' },
            { value: 'critical', label: 'Crítico' },
            { value: 'high', label: 'Alto' },
            { value: 'medium', label: 'Médio' },
            { value: 'low', label: 'Baixo' },
          ]}
        />
        <Select
          value={filterType}
          onChange={setFilterType}
          options={[
            { value: 'all', label: 'Tipo' },
            { value: 'secret', label: 'Segredo' },
            { value: 'endpoint', label: 'Endpoint' },
            { value: 'sensitive_file', label: 'Arquivos sensíveis' },
            { value: 'takeover', label: 'Takeover' },
          ]}
        />
        <Select
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: 'all', label: 'Status' },
            { value: 'confirmed', label: 'Confirmado' },
            { value: 'false_positive', label: 'Falso positivo' },
            { value: 'analyzing', label: 'Em análise' },
          ]}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {['Gravidade', 'Tipo', 'Título', 'Alvo', 'Arquivo', 'Status', 'Dados'].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr
                key={f.id}
                onClick={() => setSelected(f)}
                className="border-b border-border hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${severityDot[f.severity]}`} />
                    <SeverityBadge severity={f.severity} />
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-subtle text-[11px]">{typeLabel[f.type]}</td>
                <td className="px-4 py-3 font-medium text-foreground text-xs">{f.title}</td>
                <td className="px-4 py-3 font-mono text-muted text-[11px]">{f.target}</td>
                <td className="px-4 py-3 font-mono text-muted text-[11px]">
                  {f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-4 py-3 font-mono text-muted text-[11px]">{f.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <FindingPanel finding={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

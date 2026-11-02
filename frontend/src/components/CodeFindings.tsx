import { useState } from 'react';
import { SeverityBadge, StatusBadge } from '../utils';
import type { Endpoint, Secret, SensitiveFile } from '../types';

type Tab = 'endpoints' | 'secrets' | 'files';

const severityFileIcon: Record<string, string> = {
  critical: 'text-crit',
  high: 'text-high',
  medium: 'text-med',
  low: 'text-low',
  info: 'text-subtle',
  unrated: 'text-muted',
};

interface CodeFindingsProps {
  endpointsList: Endpoint[];
  secretsList: Secret[];
  sensitiveFilesList: SensitiveFile[];
}

export default function CodeFindings({
  endpointsList,
  secretsList,
  sensitiveFilesList,
}: CodeFindingsProps) {
  const [tab, setTab] = useState<Tab>('endpoints');

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'endpoints', label: 'Endpoints', count: endpointsList.length },
    { id: 'secrets', label: 'Secrets', count: secretsList.length },
    { id: 'files', label: 'Arq. sensíveis', count: sensitiveFilesList.length },
  ];

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center border-b border-border px-4 pt-4">
        <h2 className="font-display font-600 text-sm text-foreground tracking-wide mr-4">Código</h2>
        <div className="flex gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-[11px] font-mono rounded-t transition-colors flex items-center gap-1.5 ${
                tab === t.id
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-muted hover:text-subtle'
              }`}
            >
              {t.label}
              <span className={`text-[9px] px-1 rounded ${tab === t.id ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto max-h-72">
        {tabs.find((t) => t.id === tab)?.count === 0 && (
          <p className="px-4 py-8 text-center text-muted font-mono text-[11px]">Nada encontrado.</p>
        )}
        {tab === 'endpoints' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Endpoint', 'Host', 'Arquivo', 'IA'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {endpointsList.map((e, i) => (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-foreground text-[11px]">{e.path}</td>
                  <td className="px-4 py-2.5 font-mono text-muted text-[10px]">{e.host}</td>
                  <td className="px-4 py-2.5 font-mono text-subtle text-[10px]">{e.file}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'secrets' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Tipo', 'Arquivo', 'Valor detectado', 'Validação IA'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {secretsList.map((s, i) => (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-foreground text-[11px]">{s.type}</td>
                  <td className="px-4 py-2.5 font-mono text-subtle text-[10px]">{s.file}</td>
                  <td className="px-4 py-2.5 font-mono text-accent text-[11px]">{s.maskedValue}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'files' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Arquivo', 'Host', 'Status', 'Severidade'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensitiveFilesList.map((f, i) => (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-foreground text-[11px] flex items-center gap-1.5">
                    <span className={severityFileIcon[f.severity]}>●</span>
                    {f.filename}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted text-[10px]">{f.host}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-mono ${f.accessible ? 'text-crit font-semibold' : 'text-muted'}`}>
                      {f.accessible ? 'Acessível publicamente' : 'Bloqueado'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <SeverityBadge severity={f.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

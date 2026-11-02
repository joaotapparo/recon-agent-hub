import { useState } from 'react';
import { subdomains, openPorts, takeoverRisks } from '../mockData';
import { SeverityBadge } from '../utils';

type Tab = 'subdomains' | 'ports' | 'takeover';

interface InfrastructureProps {
  subdomainsList?: typeof subdomains;
  openPortsList?: typeof openPorts;
  takeoverRisksList?: typeof takeoverRisks;
}

export default function Infrastructure({
  subdomainsList = subdomains,
  openPortsList = openPorts,
  takeoverRisksList = takeoverRisks,
}: InfrastructureProps) {
  const [tab, setTab] = useState<Tab>('subdomains');

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'subdomains', label: 'Subdomínios', count: subdomainsList.length },
    { id: 'ports', label: 'Portas', count: openPortsList.length },
    { id: 'takeover', label: 'Takeover', count: takeoverRisksList.length },
  ];

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center border-b border-border px-4 pt-4">
        <h2 className="font-display font-600 text-sm text-foreground tracking-wide mr-4">Infraestrutura</h2>
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
        {tab === 'subdomains' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Subdomínio', 'Status', 'IP', 'Portas'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subdomainsList.map((s) => (
                <tr key={s.host} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-foreground text-[11px]">{s.host}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'active' ? 'bg-ok' : 'bg-border-2'}`} />
                      <span className={`font-mono text-[10px] ${s.status === 'active' ? 'text-ok' : 'text-muted'}`}>
                        {s.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-subtle text-[11px]">{s.ip ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {s.ports.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        s.ports.map((p) => (
                          <span key={p} className="font-mono text-[10px] text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded">
                            {p}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'ports' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Host', 'Porta', 'Protocolo', 'Serviço'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openPortsList.map((p, i) => (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-foreground text-[11px]">{p.host}</td>
                  <td className="px-4 py-2.5 font-mono text-accent text-[11px]">{p.port}</td>
                  <td className="px-4 py-2.5 font-mono text-subtle uppercase text-[10px]">{p.protocol}</td>
                  <td className="px-4 py-2.5 font-mono text-subtle text-[11px]">{p.service}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'takeover' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Subdomínio', 'CNAME', 'Status', 'Severidade'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {takeoverRisksList.map((r, i) => (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-foreground text-[11px]">{r.subdomain}</td>
                  <td className="px-4 py-2.5 font-mono text-muted text-[10px]">{r.cname}</td>
                  <td className="px-4 py-2.5 font-mono text-subtle text-[10px]">{r.status}</td>
                  <td className="px-4 py-2.5">
                    <SeverityBadge severity={r.severity} />
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

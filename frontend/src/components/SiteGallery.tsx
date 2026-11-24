import { useState } from 'react';
import { api } from '../lib/api';
import type { Finding, Subdomain } from '../types';

interface Props {
  scanId: number;
  hosts: string[];
  subdomains: Subdomain[];
  findings: Finding[];
}

function issuesFor(host: string, findings: Finding[]): number {
  return findings.filter((f) => {
    if (f.status === 'false_positive' || f.type === 'open_port') return false;
    try {
      return new URL(f.target).hostname === host;
    } catch {
      return f.target === host;
    }
  }).length;
}

/** Galeria com o print da página inicial de cada site encontrado. */
export default function SiteGallery({ scanId, hosts, subdomains, findings }: Props) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!hosts.length) return null;

  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-600 text-base text-foreground tracking-wide">Sites encontrados</h2>
        <span className="text-[10px] font-mono text-muted">{hosts.length} print(s)</span>
      </div>
      <p className="text-xs text-muted mb-4">Como cada endereço da empresa aparece para qualquer pessoa na internet.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {hosts.map((host, i) => {
          const issues = issuesFor(host, findings);
          const sub = subdomains.find((s) => s.host === host);
          return (
            <button
              key={host}
              onClick={() => setZoom(host)}
              className="group text-left rounded-lg border border-border-2 bg-surface-2 overflow-hidden cursor-zoom-in hover:border-subtle transition-colors animate-row-in"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="relative aspect-[16/10] bg-bg overflow-hidden">
                <img
                  src={api.screenshotUrl(scanId, host)}
                  alt={`Página inicial de ${host}`}
                  loading="lazy"
                  className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-500"
                />
                {issues > 0 && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-med text-zinc-950 text-[10px] font-mono font-bold">
                    {issues} ponto(s)
                  </span>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="text-xs font-mono text-foreground truncate">{host}</p>
                <p className="text-[10px] text-muted truncate">{sub?.ip ?? ' '}</p>
              </div>
            </button>
          );
        })}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setZoom(null)}>
          <figure className="max-w-5xl w-full">
            <img src={api.screenshotUrl(scanId, zoom)} alt={`Página inicial de ${zoom}`} className="w-full rounded-lg border border-border-2" />
            <figcaption className="text-center text-xs font-mono text-subtle mt-2">{zoom}</figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}

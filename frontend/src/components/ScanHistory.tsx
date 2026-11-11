import { useEffect, useMemo, useState } from 'react';
import { api, type ApiScanSummary } from '../lib/api';
import { formatDate, toFinding } from '../lib/adapters';
import type { Finding } from '../types';

const SEV_COLORS: [string, string][] = [
  ['critical', '#f87171'],
  ['high', '#fb923c'],
  ['medium', '#facc15'],
  ['low', '#94a3b8'],
  ['info', '#a1a1aa'],
  ['unrated', '#52525b'],
];

/**
 * Mesmo problema em scans diferentes: tipo + ferramenta + alvo + título sem
 * números e sem acentos (títulos antigos eram gravados sem acento).
 */
function findingKey(f: Finding): string {
  const title = f.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\d+/g, '#').toLowerCase();
  return `${f.type}|${f.sourceTool}|${f.target}|${title}`;
}

function isOpenIssue(f: Finding): boolean {
  return f.status !== 'false_positive' && f.type !== 'open_port';
}

interface Props {
  history: ApiScanSummary[];
  currentScanId: number;
  currentFindings: Finding[];
  onSelect: (scanId: number) => void;
}

export default function ScanHistory({ history, currentScanId, currentFindings, onSelect }: Props) {
  const chronological = useMemo(() => [...history].reverse(), [history]);
  const idx = chronological.findIndex((h) => h.id === currentScanId);
  const previous = idx > 0 ? chronological.slice(0, idx).reverse().find((h) => h.status === 'completed') : undefined;

  const [prevFindings, setPrevFindings] = useState<Finding[] | null>(null);
  useEffect(() => {
    setPrevFindings(null);
    if (!previous) return;
    let cancelled = false;
    api
      .getFindings(previous.id)
      .then((list) => !cancelled && setPrevFindings(list.map(toFinding)))
      .catch(() => !cancelled && setPrevFindings([]));
    return () => {
      cancelled = true;
    };
  }, [previous?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const diff = useMemo(() => {
    if (!prevFindings) return null;
    const before = new Map(prevFindings.filter(isOpenIssue).map((f) => [findingKey(f), f]));
    const now = new Map(currentFindings.filter(isOpenIssue).map((f) => [findingKey(f), f]));
    return {
      fixed: [...before].filter(([k]) => !now.has(k)).map(([, f]) => f),
      added: [...now].filter(([k]) => !before.has(k)).map(([, f]) => f),
      kept: [...now.keys()].filter((k) => before.has(k)).length,
    };
  }, [prevFindings, currentFindings]);

  const max = Math.max(1, ...chronological.map((h) => h.findings));
  const current = chronological[idx];

  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-600 text-base text-foreground tracking-wide">Evolução ao longo do tempo</h2>
        <span className="text-[10px] font-mono text-muted">{history.length} análises</span>
      </div>
      <p className="text-xs text-muted mb-4">Cada barra é uma análise; a altura é o número de problemas abertos. Clique para abrir.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="flex items-end gap-2 h-40 border-b border-border px-1 overflow-x-auto">
          {chronological.map((h, i) => {
            const active = h.id === currentScanId;
            const done = h.status === 'completed';
            return (
              <button
                key={h.id}
                onClick={() => onSelect(h.id)}
                title={`Análise de ${formatDate(h.created_at)}: ${h.findings} problema(s)`}
                className={`group flex flex-col items-center justify-end h-full min-w-[34px] flex-1 max-w-[56px] cursor-pointer ${active ? '' : 'opacity-60 hover:opacity-100'}`}
              >
                <span className="text-[10px] font-mono text-subtle mb-1 tabular-nums">{done ? h.findings : '…'}</span>
                <div
                  className={`w-full rounded-t flex flex-col-reverse overflow-hidden animate-row-in ${active ? 'ring-1 ring-white/70' : ''}`}
                  style={{ height: `${Math.max(4, (h.findings / max) * 100)}%`, animationDelay: `${i * 80}ms` }}
                >
                  {h.findings === 0 && <div className="flex-1 bg-ok/60" />}
                  {SEV_COLORS.map(([sev, color]) => {
                    const n = h.by_severity[sev as keyof typeof h.by_severity] ?? 0;
                    return n ? <div key={sev} style={{ flexGrow: n, background: color }} /> : null;
                  })}
                </div>
                <span className={`text-[9px] font-mono mt-1 ${active ? 'text-foreground' : 'text-muted'}`}>
                  {formatDate(h.created_at).slice(0, 5)}
                </span>
              </button>
            );
          })}
        </div>

        <div>
          {!previous && <p className="text-xs text-muted">Esta é a primeira análise concluída: ainda não há com o que comparar.</p>}
          {previous && current && (
            <>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-2">
                Comparado à análise de {formatDate(previous.created_at)}
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Delta label="Resolvidos" value={diff?.fixed.length} cls="text-ok" />
                <Delta label="Novos" value={diff?.added.length} cls="text-crit" />
                <Delta label="Continuam" value={diff?.kept} cls="text-med" />
              </div>
              {diff && (
                <ul className="space-y-1 max-h-32 overflow-y-auto text-[11px]">
                  {diff.fixed.map((f) => (
                    <li key={`f-${f.id}`} className="text-ok flex gap-2"><span>✓</span><span className="text-subtle">{f.title}</span></li>
                  ))}
                  {diff.added.map((f) => (
                    <li key={`a-${f.id}`} className="text-crit flex gap-2"><span>+</span><span className="text-subtle">{f.title}</span></li>
                  ))}
                  {diff.fixed.length + diff.added.length === 0 && (
                    <li className="text-muted">Nenhuma mudança nos problemas encontrados.</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Delta({ label, value, cls }: { label: string; value: number | undefined; cls: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded px-2 py-2 text-center">
      <p className={`font-display text-2xl font-bold leading-none tabular-nums ${cls}`}>{value ?? '…'}</p>
      <p className="text-[9px] font-mono text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

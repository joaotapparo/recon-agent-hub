import { useMemo } from 'react';
import type { Finding } from '../../types';
import { SEV_RANK, isIssue } from '../../lib/score';
import { SeverityBadge } from '../../utils';

interface Props {
  findings: Finding[];
  onOpenFinding: (id: string) => void;
}

/** Faixa correndo com os achados, como cotação da bolsa. */
export default function FindingTicker({ findings, onOpenFinding }: Props) {
  const items = useMemo(
    () => findings.filter(isIssue).sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]),
    [findings],
  );
  // velocidade constante: mais itens, volta mais longa
  const duration = Math.max(20, items.length * 6);

  return (
    <div className="relative flex items-center h-10 border-t border-border bg-surface/80 backdrop-blur overflow-hidden">
      <span className="relative z-10 shrink-0 h-full flex items-center gap-2 px-4 bg-surface border-r border-border text-[10px] font-mono uppercase tracking-widest text-subtle">
        <span className="w-1.5 h-1.5 rounded-full bg-crit animate-pulse" /> achados
      </span>
      {items.length === 0 ? (
        <span className="px-4 text-[11px] font-mono text-muted">Aguardando os primeiros achados…</span>
      ) : (
        <div className="flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
          <div className="flex w-max animate-ticker hover:[animation-play-state:paused]" style={{ animationDuration: `${duration}s` }}>
            {/* duas cópias para a volta não ter emenda */}
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
                {items.map((f) => (
                  <button
                    key={`${copy}-${f.id}`}
                    onClick={() => onOpenFinding(f.id)}
                    className="flex items-center gap-2 px-5 text-[11px] whitespace-nowrap cursor-pointer hover:text-foreground text-subtle"
                  >
                    <SeverityBadge severity={f.severity} />
                    <span>{f.title}</span>
                    <span className="text-muted/60">•</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, DoorOpen, Flame, Link2, Route } from 'lucide-react';
import { api, type ApiAttackChain, type ChainStepKind } from '../lib/api';
import type { Finding, SeverityLevel } from '../types';
import { SeverityBadge } from '../utils';

const ICON: Record<ChainStepKind, { icon: typeof DoorOpen; color: string }> = {
  entry: { icon: DoorOpen, color: '#38bdf8' },
  pivot: { icon: Route, color: '#facc15' },
  impact: { icon: Flame, color: '#f87171' },
};

interface Props {
  scanId: number;
  findings: Finding[];
  onOpen: () => void;
}

/** A cadeia de ataque mais grave, em uma linha, no resumo. */
export default function TopChain({ scanId, findings, onOpen }: Props) {
  const [chain, setChain] = useState<ApiAttackChain | null | undefined>(undefined);
  const key = findings.map((f) => `${f.id}:${f.status}:${f.severity}`).join(',');

  useEffect(() => {
    let cancelled = false;
    api
      .getAttackChains(scanId)
      .then((d) => !cancelled && setChain(d.chains[0] ?? null))
      .catch(() => !cancelled && setChain(null));
    return () => {
      cancelled = true;
    };
  }, [scanId, key]);

  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-600 text-base text-foreground tracking-wide flex items-center gap-2">
          <Link2 size={15} /> Principal caminho de ataque
        </h2>
        <button onClick={onOpen} className="text-[10px] font-mono text-muted hover:text-foreground flex items-center gap-1 cursor-pointer">
          ver todas <ArrowRight size={11} />
        </button>
      </div>
      {chain === undefined && <p className="text-xs font-mono text-muted py-6 text-center">Carregando…</p>}
      {chain === null && <p className="text-xs font-mono text-muted py-6 text-center">Nenhuma combinação de risco encontrada.</p>}
      {chain && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <SeverityBadge severity={chain.severity as SeverityLevel} />
            <p className="text-sm text-foreground font-medium">{chain.title}</p>
          </div>
          <motion.ol
            className="flex flex-wrap items-center gap-y-2"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.25 } } }}
          >
            {chain.steps.map((step, i) => {
              const st = ICON[step.kind] ?? ICON.pivot;
              const Icon = st.icon;
              return (
                <motion.li
                  key={i}
                  className="flex items-center"
                  variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }}
                >
                  <button
                    onClick={onOpen}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 bg-surface-2 hover:bg-surface-3 cursor-pointer transition-colors"
                    style={{ borderColor: `${st.color}44` }}
                  >
                    <Icon size={13} style={{ color: st.color }} />
                    <span className="text-xs text-foreground">{step.title}</span>
                  </button>
                  {i < chain.steps.length - 1 && <ArrowRight size={14} className="mx-1.5 text-muted shrink-0" />}
                </motion.li>
              );
            })}
          </motion.ol>
        </>
      )}
    </section>
  );
}

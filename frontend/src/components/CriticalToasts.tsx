import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Siren, X } from 'lucide-react';
import type { Finding } from '../types';
import { SEV_RANK } from '../lib/score';
import { SEV_COLOR } from '../lib/hosts';
import { typeLabel } from '../utils';

interface Props {
  /** muda a cada análise aberta: zera o que já foi visto */
  scanKey: string | number;
  findings: Finding[];
  onOpenFinding: (id: string) => void;
}

interface Toast {
  id: string;
  finding: Finding;
}

const TTL_MS = 7000;

/**
 * Alerta quando um achado alto/crítico aparece durante a análise (ao vivo ou
 * no modo demonstração), com um clarão vermelho na tela. Os achados que já
 * estavam lá quando o painel abriu não disparam alerta.
 */
export default function CriticalToasts({ scanKey, findings, onOpenFinding }: Props) {
  const seen = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    seen.current = null;
    setToasts([]);
  }, [scanKey]);

  useEffect(() => {
    const hot = findings.filter((f) => f.status !== 'false_positive' && SEV_RANK[f.severity] >= 4);
    if (seen.current === null) {
      seen.current = new Set(hot.map((f) => f.id));
      return;
    }
    const fresh = hot.filter((f) => !seen.current!.has(f.id));
    if (!fresh.length) return;
    fresh.forEach((f) => seen.current!.add(f.id));
    setToasts((t) => [...fresh.map((finding) => ({ id: `${finding.id}-${Date.now()}`, finding })), ...t].slice(0, 4));
    setFlash((n) => n + 1);
  }, [findings]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((t) => t.slice(0, -1)), TTL_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <>
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={flash}
            className="fixed inset-0 z-[60] pointer-events-none"
            style={{ boxShadow: 'inset 0 0 160px 40px rgba(248,113,113,.55)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0, 0.7, 0] }}
            transition={{ duration: 1.4, times: [0, 0.15, 0.4, 0.55, 1] }}
          />
        )}
      </AnimatePresence>
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]">
        <AnimatePresence>
          {toasts.map(({ id, finding }) => {
            const color = SEV_COLOR[finding.severity];
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, x: 80, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                className="relative overflow-hidden rounded-xl border bg-surface-2/95 backdrop-blur shadow-2xl"
                style={{ borderColor: `${color}66` }}
              >
                <motion.span
                  className="absolute bottom-0 left-0 h-0.5"
                  style={{ background: color }}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: TTL_MS / 1000, ease: 'linear' }}
                />
                <button
                  onClick={() => onOpenFinding(finding.id)}
                  className="w-full text-left flex gap-3 px-4 py-3 cursor-pointer"
                >
                  <motion.span
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${color}22`, color }}
                  >
                    <Siren size={18} />
                  </motion.span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-mono uppercase tracking-widest" style={{ color }}>
                      {finding.severity === 'critical' ? 'Achado crítico' : 'Achado grave'} · {typeLabel[finding.type]}
                    </span>
                    <span className="block text-sm text-foreground leading-snug">{finding.title}</span>
                    <span className="block text-[10px] font-mono text-muted truncate">{finding.target}</span>
                  </span>
                </button>
                <button
                  onClick={() => setToasts((t) => t.filter((x) => x.id !== id))}
                  className="absolute top-2 right-2 p-1 text-muted hover:text-foreground cursor-pointer"
                  aria-label="Fechar"
                >
                  <X size={12} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}

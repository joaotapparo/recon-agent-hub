import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, RotateCcw, Wrench } from 'lucide-react';
import type { Finding } from '../types';
import { GRADES, contributions, gradeOf, scoreOf } from '../lib/score';
import { SeverityBadge, typeLabel } from '../utils';
import AnimatedNumber from './AnimatedNumber';

interface Props {
  findings: Finding[];
  running: boolean;
  onOpenFinding: (id: string) => void;
}

const R = 80;
const ARC = Math.PI * R; // meia-volta

/** Medidor de 0 a 100 com a letra no meio. */
export function Gauge({
  score,
  color,
  grade,
  className = 'max-w-[260px]',
  letterClass = 'text-6xl',
  numberClass = 'text-sm',
}: {
  score: number;
  color: string;
  grade: string;
  className?: string;
  letterClass?: string;
  numberClass?: string;
}) {
  return (
    <div className={`relative w-full mx-auto ${className}`}>
      <svg viewBox="-100 -95 200 110" className="w-full overflow-visible">
        <defs>
          <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* trilho com marcas */}
        <path d={`M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0`} fill="none" stroke="#27272a" strokeWidth="14" strokeLinecap="round" />
        {Array.from({ length: 21 }, (_, i) => {
          const a = Math.PI - (i / 20) * Math.PI;
          const r1 = R + 12;
          const r2 = R + (i % 5 === 0 ? 19 : 15);
          return (
            <line
              key={i}
              x1={Math.cos(a) * r1}
              y1={-Math.sin(a) * r1}
              x2={Math.cos(a) * r2}
              y2={-Math.sin(a) * r2}
              stroke="#3f3f46"
              strokeWidth={i % 5 === 0 ? 1.5 : 0.8}
            />
          );
        })}
        <motion.path
          d={`M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          filter="url(#gauge-glow)"
          strokeDasharray={ARC}
          initial={{ strokeDashoffset: ARC }}
          animate={{ strokeDashoffset: ARC * (1 - score / 100), stroke: color }}
          transition={{ type: 'spring', stiffness: 40, damping: 14 }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={grade}
            initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className={`font-display font-700 leading-none ${letterClass}`}
            style={{ color, textShadow: `0 0 28px ${color}66` }}
          >
            {grade}
          </motion.span>
        </AnimatePresence>
        <span className={`font-mono text-subtle mt-1 ${numberClass}`}>
          <AnimatedNumber value={score} /> / 100
        </span>
      </div>
    </div>
  );
}

export default function RiskScore({ findings, running, onOpenFinding }: Props) {
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  // achados que sumiram (nova análise, revisão) não ficam presos na simulação
  const valid = useMemo(() => new Set([...fixed].filter((id) => findings.some((f) => f.id === id))), [fixed, findings]);

  const realScore = scoreOf(findings);
  const realGrade = gradeOf(findings);
  const score = scoreOf(findings, valid);
  const grade = gradeOf(findings, valid);
  const g = GRADES[grade];
  const list = useMemo(() => contributions(findings, new Set()), [findings]);
  const simulating = valid.size > 0;
  // no começo da análise ainda não há o que avaliar: "A 100" seria enganoso
  const waiting = running && list.length === 0;

  const toggle = (id: string) =>
    setFixed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="relative overflow-hidden bg-surface border border-border rounded-xl p-5 h-full flex flex-col">
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[260px] rounded-full blur-3xl opacity-25 transition-colors duration-700"
        style={{ background: g.color }}
      />
      <div className="relative flex items-center justify-between mb-2">
        <h2 className="font-display font-600 text-base text-foreground tracking-wide">Nota de segurança</h2>
        {running && <span className="text-[10px] font-mono text-muted animate-pulse">parcial · análise em andamento</span>}
      </div>

      {waiting ? (
        <div className="relative w-full max-w-[260px] mx-auto aspect-[2/1.1] flex flex-col items-center justify-end">
          <span className="font-display font-700 text-6xl leading-none text-muted animate-pulse">?</span>
          <span className="font-mono text-xs text-muted mt-2">calculando…</span>
        </div>
      ) : (
        <Gauge score={score} color={g.color} grade={grade} />
      )}

      <div className="relative text-center mt-3 min-h-[44px]">
        <p className="text-sm font-semibold" style={{ color: waiting ? '#71717a' : g.color }}>
          {waiting ? 'Aguardando os primeiros resultados' : g.title}
        </p>
        <AnimatePresence>
          {simulating && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[11px] font-mono text-ok flex items-center justify-center gap-1.5 mt-1"
            >
              <Sparkles size={12} /> Simulação: {realGrade} ({realScore}) → {grade} ({score}) corrigindo {valid.size} item(ns)
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="relative mt-3 flex items-center justify-between">
        <p className="text-[10px] font-mono text-muted tracking-widest uppercase flex items-center gap-1.5">
          <Wrench size={11} /> Simular correção
        </p>
        {simulating && (
          <button
            onClick={() => setFixed(new Set())}
            className="text-[10px] font-mono text-muted hover:text-foreground flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw size={11} /> desfazer
          </button>
        )}
      </div>

      <ul className="relative mt-2 space-y-1.5 overflow-y-auto max-h-[230px] pr-1 -mr-1">
        {list.length === 0 && (
          <li className="text-xs text-muted font-mono py-4 text-center">
            {running ? 'Aguardando achados…' : 'Nada pesando na nota.'}
          </li>
        )}
        {list.map(({ finding, gain }, i) => {
          const on = valid.has(finding.id);
          return (
            <motion.li
              key={finding.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.04 }}
              className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                on ? 'border-ok/40 bg-ok/10' : 'border-border-2 bg-surface-2 hover:border-subtle/40'
              }`}
            >
              <button
                onClick={() => toggle(finding.id)}
                aria-pressed={on}
                title={on ? 'Desfazer simulação' : 'Simular que foi corrigido'}
                className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${
                  on ? 'bg-ok border-ok text-zinc-950 scale-110' : 'border-border-2 group-hover:border-subtle'
                }`}
              >
                {on && <span className="text-[10px] font-bold">✓</span>}
              </button>
              <button onClick={() => onOpenFinding(finding.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                <p className={`text-xs truncate ${on ? 'text-muted line-through' : 'text-foreground'}`}>{finding.title}</p>
                <p className="text-[10px] font-mono text-muted truncate">{typeLabel[finding.type]}</p>
              </button>
              <SeverityBadge severity={finding.severity} />
              <span className="text-[10px] font-mono text-ok w-9 text-right shrink-0">+{gain}</span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

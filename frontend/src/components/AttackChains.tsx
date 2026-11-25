import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, DoorOpen, Flame, Link2, Loader2, Play, Route, Sparkles, Square } from 'lucide-react';
import { api, type ApiAttackChain, type ApiAttackChainSet, type ChainStepKind } from '../lib/api';
import type { Finding, SeverityLevel } from '../types';
import { SEV_COLOR } from '../lib/hosts';
import { SeverityBadge } from '../utils';

interface Props {
  scanId: number;
  completed: boolean;
  findings: Finding[];
  readOnly: boolean;
  onOpenFinding: (id: string) => void;
}

const STEP_STYLE: Record<ChainStepKind, { icon: typeof DoorOpen; label: string; color: string }> = {
  entry: { icon: DoorOpen, label: 'Porta de entrada', color: '#38bdf8' },
  pivot: { icon: Route, label: 'Avanço', color: '#facc15' },
  impact: { icon: Flame, label: 'Impacto', color: '#f87171' },
};

const STEP_MS = 1700;

/** Como achados isolados se somam num ataque, contado passo a passo. */
export default function AttackChains({ scanId, completed, findings, readOnly, onOpenFinding }: Props) {
  const [data, setData] = useState<ApiAttackChainSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [generating, setGenerating] = useState(false);
  // passo destacado na reprodução (-1 = mostrando tudo)
  const [playStep, setPlayStep] = useState(-1);
  const timer = useRef<number | undefined>(undefined);

  // as cadeias por regra mudam conforme os achados chegam ou são revisados
  const findingsKey = findings.map((f) => `${f.id}:${f.status}:${f.severity}`).join(',');
  useEffect(() => {
    let cancelled = false;
    api
      .getAttackChains(scanId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [scanId, findingsKey]);

  useEffect(() => () => window.clearInterval(timer.current), []);
  useEffect(() => {
    stop();
    setSelected(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const chains = data?.chains ?? [];
  const chain: ApiAttackChain | undefined = chains[Math.min(selected, chains.length - 1)];

  const stop = () => {
    window.clearInterval(timer.current);
    timer.current = undefined;
    setPlayStep(-1);
  };

  const play = () => {
    if (!chain) return;
    stop();
    let i = 0;
    setPlayStep(0);
    timer.current = window.setInterval(() => {
      i += 1;
      if (i >= chain.steps.length) {
        window.clearInterval(timer.current);
        timer.current = undefined;
        window.setTimeout(() => setPlayStep(-1), STEP_MS);
        return;
      }
      setPlayStep(i);
    }, STEP_MS);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const d = await api.generateAttackChains(scanId);
      setData(d);
      setSelected(0);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const findingById = (id: number) => findings.find((f) => f.apiId === id);
  const visible = (i: number) => playStep === -1 || i <= playStep;

  return (
    <section className="relative bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
        <div>
          <h2 className="font-display font-600 text-base text-foreground tracking-wide flex items-center gap-2">
            <Link2 size={16} /> Cadeias de ataque
          </h2>
          <p className="text-xs text-muted">Como os achados se combinam: da porta de entrada até o impacto no negócio.</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span
              className={`text-[10px] font-mono px-2 py-1 rounded border ${
                data.source === 'ai' ? 'text-violet-300 border-violet-400/30 bg-violet-400/10' : 'text-subtle border-border-2 bg-surface-2'
              }`}
            >
              {data.source === 'ai' ? `IA · ${data.model ?? ''}` : 'por regras'}
            </span>
          )}
          {!readOnly && completed && (
            <button
              onClick={generate}
              disabled={generating}
              className="group relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-violet-200 border border-violet-400/40 bg-violet-500/10 hover:bg-violet-500/20 disabled:opacity-60 cursor-pointer transition-colors"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {generating ? 'A IA está pensando…' : data?.source === 'ai' ? 'Gerar de novo com IA' : 'Gerar com IA'}
              {generating && <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />}
            </button>
          )}
        </div>
      </div>

      {data?.warning && <p className="px-5 pt-3 text-[11px] font-mono text-med">{data.warning}</p>}
      {error && <p className="px-5 pt-3 text-[11px] font-mono text-crit">{error}</p>}

      {chains.length === 0 ? (
        <p className="px-5 py-12 text-center text-xs font-mono text-muted">
          {data ? 'Nenhuma combinação de risco encontrada com os achados atuais.' : 'Carregando…'}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
          <ul className="p-3 space-y-2 border-b lg:border-b-0 lg:border-r border-border">
            {chains.map((c, i) => (
              <motion.li key={c.id} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
                <button
                  onClick={() => {
                    stop();
                    setSelected(i);
                  }}
                  className={`relative w-full text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all overflow-hidden ${
                    i === selected ? 'border-subtle/50 bg-surface-3' : 'border-border-2 bg-surface-2 hover:bg-surface-3'
                  }`}
                >
                  {i === selected && (
                    <motion.span layoutId="chain-active" className="absolute left-0 top-0 bottom-0 w-1" style={{ background: SEV_COLOR[c.severity as SeverityLevel] }} />
                  )}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <SeverityBadge severity={c.severity as SeverityLevel} />
                    <span className="text-[10px] font-mono text-muted">{c.steps.length} passos</span>
                  </div>
                  <p className="text-xs text-foreground leading-snug">{c.title}</p>
                </button>
              </motion.li>
            ))}
          </ul>

          {chain && (
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="font-display font-600 text-lg text-foreground leading-tight">{chain.title}</h3>
                  {chain.impact && <p className="text-xs text-subtle mt-1 max-w-2xl">{chain.impact}</p>}
                </div>
                <button
                  onClick={playStep >= 0 ? stop : play}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-foreground border border-border-2 bg-surface-2 hover:bg-surface-3 cursor-pointer"
                >
                  {playStep >= 0 ? <Square size={12} /> : <Play size={12} />}
                  {playStep >= 0 ? 'Parar' : 'Reproduzir ataque'}
                </button>
              </div>

              <AnimatePresence mode="wait">
                <motion.ol
                  key={chain.id + (data?.generated_at ?? '')}
                  className="relative flex flex-col md:flex-row md:items-stretch"
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.18 } } }}
                >
                  {chain.steps.map((step, i) => {
                    const st = STEP_STYLE[step.kind] ?? STEP_STYLE.pivot;
                    const Icon = st.icon;
                    const active = playStep === i;
                    return (
                      <motion.li
                        key={i}
                        className="relative flex flex-col md:flex-row md:flex-1 items-stretch min-w-0"
                        variants={{ hidden: { opacity: 0, y: 24, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1 } }}
                        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                      >
                        <motion.div
                          animate={{
                            opacity: visible(i) ? 1 : 0.18,
                            scale: active ? 1.04 : 1,
                            boxShadow: active ? `0 0 32px ${st.color}55` : '0 0 0 rgba(0,0,0,0)',
                          }}
                          className="relative flex-1 min-w-0 rounded-xl border bg-surface-2 p-3.5"
                          style={{ borderColor: active ? st.color : '#2e2e33' }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: `${st.color}1f`, color: st.color, border: `1px solid ${st.color}55` }}
                            >
                              <Icon size={14} />
                            </span>
                            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: st.color }}>
                              {i + 1}. {st.label}
                            </span>
                          </div>
                          <p className="text-sm text-foreground font-medium leading-snug">{step.title}</p>
                          {step.description && <p className="text-xs text-subtle mt-1 leading-relaxed">{step.description}</p>}
                          {step.finding_ids.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2.5">
                              {step.finding_ids.map((id) => {
                                const f = findingById(id);
                                if (!f) return null;
                                return (
                                  <button
                                    key={id}
                                    onClick={() => onOpenFinding(f.id)}
                                    title={f.title}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded border max-w-full truncate cursor-pointer hover:brightness-125"
                                    style={{ color: SEV_COLOR[f.severity], borderColor: `${SEV_COLOR[f.severity]}55`, background: `${SEV_COLOR[f.severity]}14` }}
                                  >
                                    #{id} {f.title.length > 28 ? `${f.title.slice(0, 27)}…` : f.title}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                        {i < chain.steps.length - 1 && <Connector color={st.color} lit={playStep === -1 || i < playStep} />}
                      </motion.li>
                    );
                  })}
                </motion.ol>
              </AnimatePresence>

              {data?.source === 'rules' && (
                <p className="mt-4 text-[10px] font-mono text-muted flex items-center gap-1.5">
                  <Bot size={11} /> Cadeias montadas por regras conhecidas. {completed && !readOnly ? 'Clique em "Gerar com IA" para uma análise sob medida.' : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Seta animada entre passos (horizontal no desktop, vertical no celular). */
function Connector({ color, lit }: { color: string; lit: boolean }) {
  return (
    <div className="flex items-center justify-center shrink-0 h-7 md:h-auto md:w-8">
      <svg width="28" height="16" viewBox="0 0 28 16" className="rotate-90 md:rotate-0 overflow-visible">
        <motion.path
          d="M2 8 H22"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="4 3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1, opacity: lit ? 1 : 0.2, strokeDashoffset: [0, -14] }}
          transition={{ pathLength: { duration: 0.5 }, strokeDashoffset: { repeat: Infinity, duration: 0.8, ease: 'linear' } }}
          fill="none"
        />
        <motion.path d="M20 3 L26 8 L20 13" stroke={color} strokeWidth="2" fill="none" animate={{ opacity: lit ? 1 : 0.2 }} />
      </svg>
    </div>
  );
}

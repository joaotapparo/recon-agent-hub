import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiScanEvent, EventKind, ScanStatus } from '../lib/api';
import { STAGES, STATUS_EXPLAINER, parseApiDate } from '../lib/adapters';

// ── estilo por tipo de evento ─────────────────────────────────────────────

const KIND: Record<EventKind, { color: string; text: string; icon: string; label: string }> = {
  info: { color: '#a1a1aa', text: 'text-subtle', icon: '›', label: 'info' },
  found: { color: '#22c55e', text: 'text-ok', icon: '+', label: 'achou' },
  warn: { color: '#facc15', text: 'text-med', icon: '!', label: 'atenção' },
  alert: { color: '#f87171', text: 'text-crit', icon: '✕', label: 'alerta' },
};

const STAGE_TAG: Record<string, string> = {
  enumerating: 'RECON',
  probing: 'PROBE',
  port_scanning: 'PORTS',
  checking_takeover: 'TAKEOVER',
  web_audit: 'WEB',
  scanning_js: 'JS',
  triaging: 'IA',
  completed: 'FIM',
  failed: 'ERRO',
};

function hash(n: number): number {
  // pseudo-aleatório estável por id: o blip não "pula" entre renders
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ── radar ─────────────────────────────────────────────────────────────────

function Radar({ events, running }: { events: ApiScanEvent[]; running: boolean }) {
  const blips = useMemo(
    () => events.filter((e) => e.kind !== 'info').slice(-28),
    [events],
  );
  const R = 100;
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <svg viewBox="-110 -110 220 220" className="w-full max-w-[240px] aspect-square" role="img" aria-label="Radar da análise">
      <defs>
        <radialGradient id="radar-bg">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01" />
        </radialGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <circle r={R} fill="url(#radar-bg)" stroke="#22c55e" strokeOpacity="0.35" />
      {[0.25, 0.5, 0.75].map((f) => (
        <circle key={f} r={R * f} fill="none" stroke="#22c55e" strokeOpacity="0.15" strokeDasharray="2 3" />
      ))}
      <line x1={-R} x2={R} y1={0} y2={0} stroke="#22c55e" strokeOpacity="0.12" />
      <line y1={-R} y2={R} x1={0} x2={0} stroke="#22c55e" strokeOpacity="0.12" />

      {running && (
        // rotação nativa do SVG: gira em torno do (0,0) do viewBox, o centro do radar.
        // Com CSS transform-origin o centro é calculado pela caixa do SVG e a fatia sai do círculo.
        <g>
          {!reducedMotion && (
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="3.2s" repeatCount="indefinite" />
          )}
          {/* fatia de 60° com degradê, girando */}
          <path d={`M0 0 L${R} 0 A${R} ${R} 0 0 0 ${R * Math.cos(Math.PI / 3)} ${-R * Math.sin(Math.PI / 3)} Z`} fill="url(#sweep)" />
          <line x1="0" y1="0" x2={R} y2="0" stroke="#4ade80" strokeWidth="1.5" />
        </g>
      )}

      {blips.map((e) => {
        const angle = hash(e.id) * Math.PI * 2;
        const dist = 22 + hash(e.id + 7) * (R - 30);
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const color = KIND[e.kind].color;
        return (
          <g key={e.id}>
            {e.kind === 'alert' && <circle cx={x} cy={y} r="4" fill="none" stroke={color} className="animate-ring" />}
            <circle cx={x} cy={y} r={e.kind === 'alert' ? 3.5 : 2.5} fill={color} className="animate-blip" />
          </g>
        );
      })}

      <circle r="4" fill={running ? '#4ade80' : '#71717a'} />
    </svg>
  );
}

// ── terminal ──────────────────────────────────────────────────────────────

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const timer = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(timer);
          return v;
        }
        return v + 2;
      });
    }, 14);
    return () => clearInterval(timer);
  }, [text]);
  return <>{text.slice(0, n)}</>;
}

function Terminal({ events, running, scanId }: { events: ApiScanEvent[]; running: boolean; scanId: number }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const firstBatch = useRef<{ scanId: number; id: number } | null>(null);

  // eventos que já existiam ao abrir a tela não animam um a um
  if (firstBatch.current?.scanId !== scanId) firstBatch.current = null;
  if (firstBatch.current == null && events.length) {
    firstBatch.current = { scanId, id: events[events.length - 1].id };
  }
  const seenUpTo = firstBatch.current?.id ?? null;

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const onScroll = () => {
    const el = box.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const lastId = events[events.length - 1]?.id;
  let burst = 0;

  return (
    <div className="rounded-lg border border-border-2 bg-[#050506] overflow-hidden flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-surface-2">
        <span className="w-2.5 h-2.5 rounded-full bg-crit/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-med/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-ok/70" />
        <span className="ml-2 text-[10px] font-mono text-muted">recon-agent@hub:~/scan/{scanId}</span>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-ok">
            <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" /> AO VIVO
          </span>
        )}
      </div>
      <div ref={box} onScroll={onScroll} className="h-72 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed">
        {events.length === 0 && (
          <p className="text-muted">
            {running ? 'Aguardando os primeiros resultados' : 'Sem registro de atividade para esta análise.'}
            {running && <span className="animate-blink">_</span>}
          </p>
        )}
        {events.map((e) => {
          const k = KIND[e.kind];
          const isNew = seenUpTo != null && e.id > seenUpTo;
          const delay = isNew ? Math.min(burst++ * 70, 1400) : 0;
          const isLast = e.id === lastId;
          return (
            <div
              key={e.id}
              className={`flex gap-2 ${isNew ? 'animate-line-in' : ''}`}
              style={isNew ? { animationDelay: `${delay}ms` } : undefined}
            >
              <span className="text-muted/60 shrink-0">
                {parseApiDate(e.created_at).toLocaleTimeString('pt-BR')}
              </span>
              <span className="text-muted shrink-0 w-[68px]">[{STAGE_TAG[e.stage] ?? e.stage}]</span>
              <span className={`${k.text} shrink-0 w-3 text-center`}>{k.icon}</span>
              <span className={e.kind === 'info' ? 'text-subtle' : k.text}>
                {isLast && isNew && running ? <Typewriter text={e.message} /> : e.message}
                {isLast && running && <span className="animate-blink text-ok"> ▌</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── painel ────────────────────────────────────────────────────────────────

function useElapsed(events: ApiScanEvent[], running: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!events.length) return null;
  const start = parseApiDate(events[0].created_at).getTime();
  const end = running ? now : parseApiDate(events[events.length - 1].created_at).getTime();
  const s = Math.max(0, Math.round((end - start) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  scanId: number;
  status: ScanStatus;
  events: ApiScanEvent[];
}

export default function LiveOperations({ scanId, status, events }: Props) {
  const running = status !== 'completed' && status !== 'failed';
  const explainer = STATUS_EXPLAINER[status];
  const stage = STAGES.find((s) => s.statuses.includes(status));
  const elapsed = useElapsed(events, running);
  const count = (k: EventKind) => events.filter((e) => e.kind === k).length;

  const counters = [
    { label: 'Descobertas', value: count('found'), cls: 'text-ok' },
    { label: 'Atenção', value: count('warn'), cls: 'text-med' },
    { label: 'Alertas', value: count('alert'), cls: 'text-crit' },
  ];

  return (
    <section className={`bg-surface border rounded-lg p-5 ${running ? 'border-ok/30 animate-glow' : 'border-border'}`}>
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <div className="flex flex-col items-center gap-4">
          <Radar events={events} running={running} />
          <div className="grid grid-cols-3 gap-2 w-full">
            {counters.map((c) => (
              <div key={c.label} className="bg-surface-2 border border-border rounded px-2 py-1.5 text-center">
                <p className={`font-display text-xl font-bold leading-none tabular-nums ${c.cls}`}>{c.value}</p>
                <p className="text-[9px] font-mono text-muted uppercase tracking-wider mt-1">{c.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-1 flex items-center gap-2">
                {running ? (
                  <>
                    <span className="relative flex w-2 h-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full w-2 h-2 bg-ok" />
                    </span>
                    O que está acontecendo agora
                  </>
                ) : (
                  'Resumo da operação'
                )}
              </p>
              <h2 className="font-display font-bold text-2xl text-foreground tracking-wide">
                {explainer?.title ?? status}
              </h2>
              <p className="text-sm text-subtle leading-relaxed mt-1 max-w-2xl">{explainer?.text}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {stage && running && (
                <span className="px-2 py-1 rounded border border-border-2 bg-surface-2 text-[10px] font-mono text-subtle">
                  ferramenta: {stage.tool}
                </span>
              )}
              {elapsed && (
                <span className="px-2 py-1 rounded border border-border-2 bg-surface-2 text-[10px] font-mono text-foreground tabular-nums">
                  ⏱ {elapsed}
                </span>
              )}
            </div>
          </div>
          <Terminal events={events} running={running} scanId={scanId} />
        </div>
      </div>
    </section>
  );
}

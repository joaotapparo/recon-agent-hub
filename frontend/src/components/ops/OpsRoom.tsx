import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clapperboard, Globe2, Minimize, MonitorPlay, Network, Pause, Play, Pin, Siren, Volume2, VolumeX, X } from 'lucide-react';
import type { ApiScanEvent, ScanStatus } from '../../lib/api';
import type { ScanDataset } from '../../types';
import { STATUS_EXPLAINER } from '../../lib/adapters';
import { GRADES, gradeOf, scoreOf } from '../../lib/score';
import { SEV_COLOR } from '../../lib/hosts';
import { businessImpact } from '../../lib/businessImpact';
import { sfx } from '../../lib/sound';
import { SeverityBadge, typeLabel } from '../../utils';
import AttackGraph from '../AttackGraph';
import AnimatedNumber from '../AnimatedNumber';
import { Radar, Terminal, useElapsed } from '../LiveOperations';
import { Gauge } from '../RiskScore';
import StageRail from './StageRail';
import FindingTicker from './FindingTicker';
import { useDirector } from './useDirector';

const ServerGlobe = lazy(() => import('../ServerGlobe'));

export interface ReplayControls {
  active: boolean;
  finished: boolean;
  paused: boolean;
  speed: number;
  progress: number;
  onTogglePause: () => void;
  onSpeed: (s: number) => void;
  onStop: () => void;
}

interface Props {
  dataset: ScanDataset;
  events: ApiScanEvent[];
  status: ScanStatus;
  replay: ReplayControls;
  onOpenHost: (host: string) => void;
  onOpenFinding: (id: string) => void;
  presenting: boolean;
  onTogglePresent: () => void;
}

/**
 * Sala de operações: tudo o que acontece durante a análise numa tela só,
 * sem rolagem. Radar e etapas à esquerda, palco no centro (grafo ⇄ globo,
 * comandado pelo diretor automático), terminal e nota à direita, ticker embaixo.
 */
export default function OpsRoom({ dataset, events, status, replay, onOpenHost, onOpenFinding, presenting, onTogglePresent }: Props) {
  const running = status !== 'completed' && status !== 'failed';
  const director = useDirector({
    scanKey: `${dataset.scanId}-${replay.active}`,
    domain: dataset.domain,
    status,
    subdomains: dataset.subdomains,
    findings: dataset.findings,
  });
  const elapsed = useElapsed(events, running, replay.active);
  const explainer = STATUS_EXPLAINER[status];
  const sound = useSound();
  useEventSounds(events, `${dataset.scanId}-${replay.active}`);

  const findingsCount = dataset.stats.findings;
  const score = scoreOf(dataset.findings);
  const grade = gradeOf(dataset.findings);
  const noData = dataset.findings.every((f) => f.type === 'open_port' || f.status === 'false_positive');

  const stats = [
    { label: 'endereços', value: dataset.stats.subdomains },
    { label: 'no ar', value: dataset.stats.activeHosts },
    { label: 'portas', value: dataset.stats.openPorts },
    { label: 'achados', value: findingsCount },
  ];

  const big = 'absolute inset-0 z-0';
  const mini =
    'absolute left-3 bottom-3 z-20 w-[min(34%,260px)] aspect-[16/10] rounded-xl border border-border-2 overflow-hidden bg-bg/85 shadow-2xl cursor-pointer hover:border-subtle/70';

  return (
    <div className="flex flex-col lg:h-full">
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_320px] gap-3 p-3">
        {/* ── esquerda: radar e etapas ── */}
        <aside className="bg-surface/80 backdrop-blur border border-border rounded-xl p-4 flex flex-col gap-4 min-h-0 overflow-y-auto no-scrollbar">
          <div className="flex justify-center">
            <Radar events={events} running={running} className="w-full max-w-[190px] aspect-square" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {stats.map((s) => (
              <div key={s.label} className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-center">
                <p className="font-display text-xl font-bold leading-none tabular-nums text-foreground">
                  <AnimatedNumber value={s.value} />
                </p>
                <p className="text-[9px] font-mono text-muted uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <StageRail stages={dataset.stages} />
        </aside>

        {/* ── centro: palco ── */}
        <section className="relative min-h-[60vh] lg:min-h-0 rounded-xl border border-border overflow-hidden bg-[radial-gradient(ellipse_at_center,#141418_0%,#09090b_75%)]">
          <motion.div layout transition={{ type: 'spring', stiffness: 220, damping: 30 }} className={director.stage === 'graph' ? big : mini} onClick={director.stage !== 'graph' ? () => director.pin('graph') : undefined}>
            <div className={`w-full h-full ${director.stage !== 'graph' ? 'pointer-events-none' : ''}`}>
              <AttackGraph
                variant="stage"
                domain={dataset.domain}
                subdomains={dataset.subdomains}
                findings={dataset.findings}
                openPorts={dataset.openPorts}
                running={running}
                focus={director.stage === 'graph' ? director.graphFocus : undefined}
                onInteract={() => director.pin('graph')}
                onOpenHost={onOpenHost}
                onOpenFinding={onOpenFinding}
              />
            </div>
            {director.stage !== 'graph' && <MiniLabel icon={<Network size={11} />} text="grafo" />}
          </motion.div>

          <motion.div layout transition={{ type: 'spring', stiffness: 220, damping: 30 }} className={director.stage === 'globe' ? big : mini} onClick={director.stage !== 'globe' ? () => director.pin('globe') : undefined}>
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-muted">globo…</div>}>
              <ServerGlobe
                variant={director.stage === 'globe' ? 'stage' : 'mini'}
                scanId={dataset.scanId}
                subdomains={dataset.subdomains}
                findings={dataset.findings}
                onOpenHost={onOpenHost}
                focusHost={director.globeFocusHost}
              />
            </Suspense>
            {director.stage !== 'globe' && <MiniLabel icon={<Globe2 size={11} />} text="globo" />}
          </motion.div>

          {/* varredura sutil enquanto roda */}
          {running && (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              <div className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-ok/[0.04] to-transparent animate-scan-sweep" />
            </div>
          )}

          {/* legenda da etapa */}
          <div className="pointer-events-none absolute top-0 inset-x-0 z-20 px-5 pt-4 pb-10 bg-gradient-to-b from-bg/90 via-bg/50 to-transparent">
            <AnimatePresence mode="wait">
              <motion.div key={status} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.35 }}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-ok flex items-center gap-2">
                  {running && (
                    <span className="relative flex w-2 h-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full w-2 h-2 bg-ok" />
                    </span>
                  )}
                  {replay.active ? 'demonstração' : running ? 'ao vivo' : 'concluída'} · {dataset.domain}
                  {elapsed && <span className="text-muted tabular-nums">⏱ {elapsed}</span>}
                </p>
                <h2 className="font-display font-bold text-2xl md:text-3xl text-foreground tracking-wide">{explainer?.title ?? status}</h2>
                <p className="text-xs md:text-sm text-subtle max-w-2xl leading-relaxed">{explainer?.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* controles do diretor */}
          <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5">
            <button
              onClick={director.release}
              title={director.automatic ? 'A câmera segue a ação sozinha' : 'Voltar ao diretor automático'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono border backdrop-blur cursor-pointer transition-colors ${
                director.automatic ? 'border-ok/40 text-ok bg-ok/10' : 'border-border-2 text-subtle bg-bg/70 hover:text-foreground'
              }`}
            >
              {director.automatic ? <Clapperboard size={12} /> : <Pin size={12} />}
              {director.automatic ? 'diretor automático' : 'fixado · voltar ao automático'}
            </button>
            <button
              onClick={sound.toggle}
              title={sound.on ? 'Desligar som' : 'Ligar som'}
              className="p-1.5 rounded-full border border-border-2 bg-bg/70 backdrop-blur text-subtle hover:text-foreground cursor-pointer"
            >
              {sound.on ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
            <button
              onClick={onTogglePresent}
              title="Modo apresentação (P)"
              className={`p-1.5 rounded-full border backdrop-blur cursor-pointer ${
                presenting ? 'border-crit/50 text-crit bg-crit/10' : 'border-border-2 bg-bg/70 text-subtle hover:text-foreground'
              }`}
            >
              {presenting ? <Minimize size={13} /> : <MonitorPlay size={13} />}
            </button>
          </div>

          {/* controles do replay */}
          {replay.active && (
            <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 bg-bg/80 backdrop-blur border border-border-2 rounded-full pl-3 pr-1.5 py-1">
              <div className="w-24 h-1 rounded-full bg-surface-3 overflow-hidden mr-1">
                <div className="h-full bg-ok transition-all duration-300" style={{ width: `${Math.round(replay.progress * 100)}%` }} />
              </div>
              <RoundBtn onClick={replay.onTogglePause} title={replay.paused ? 'Continuar' : 'Pausar'}>
                {replay.paused ? <Play size={12} /> : <Pause size={12} />}
              </RoundBtn>
              {[1, 2, 4].map((s) => (
                <RoundBtn key={s} onClick={() => replay.onSpeed(s)} active={replay.speed === s}>
                  <span className="text-[10px] font-mono">{s}x</span>
                </RoundBtn>
              ))}
              <RoundBtn onClick={replay.onStop} title="Sair da demonstração">
                <X size={12} />
              </RoundBtn>
            </div>
          )}

          {/* holofote no achado grave */}
          <AnimatePresence>
            {director.spot && (
              <motion.div
                key={director.spot.id}
                className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-black/55 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={director.dismissSpot}
              >
                <motion.div
                  className="pointer-events-none absolute inset-0"
                  style={{ boxShadow: 'inset 0 0 180px 40px rgba(248,113,113,.5)' }}
                  animate={{ opacity: [0, 1, 0.3, 1, 0.5] }}
                  transition={{ duration: 1.6 }}
                />
                <motion.button
                  initial={{ scale: 0.6, y: 30, rotateX: 30 }}
                  animate={{ scale: 1, y: 0, rotateX: 0 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFinding(director.spot!.id);
                  }}
                  className="relative max-w-lg w-full text-left rounded-2xl border-2 bg-surface-2/95 p-6 shadow-2xl cursor-pointer"
                  style={{ borderColor: SEV_COLOR[director.spot.severity] }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 0.9 }}
                      className="w-11 h-11 rounded-full flex items-center justify-center"
                      style={{ background: `${SEV_COLOR[director.spot.severity]}22`, color: SEV_COLOR[director.spot.severity] }}
                    >
                      <Siren size={22} />
                    </motion.span>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: SEV_COLOR[director.spot.severity] }}>
                        {director.spot.severity === 'critical' ? 'Achado crítico' : 'Achado grave'} · {typeLabel[director.spot.type]}
                      </p>
                      <SeverityBadge severity={director.spot.severity} />
                    </div>
                  </div>
                  <p className="font-display font-bold text-2xl text-foreground leading-tight">{director.spot.title}</p>
                  <p className="text-xs font-mono text-muted mt-1 break-all">{director.spot.target}</p>
                  <p className="text-sm text-subtle mt-3 leading-relaxed">{businessImpact(director.spot).why}</p>
                  <p className="text-[10px] font-mono text-muted mt-4">clique para ver os detalhes</p>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── direita: nota e terminal ── */}
        <aside className="flex flex-col gap-3 min-h-0">
          <div className="relative overflow-hidden bg-surface/80 backdrop-blur border border-border rounded-xl px-4 pt-3 pb-2">
            <div
              className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-60 h-40 rounded-full blur-3xl opacity-20 transition-colors duration-700"
              style={{ background: noData ? '#71717a' : GRADES[grade].color }}
            />
            <p className="relative text-[10px] font-mono text-muted uppercase tracking-widest flex justify-between">
              <span>nota de segurança</span>
              <span>{running ? 'parcial' : 'final'}</span>
            </p>
            {noData && running ? (
              <div className="h-[104px] flex flex-col items-center justify-center">
                <span className="font-display font-bold text-5xl text-muted animate-pulse">?</span>
                <span className="text-[10px] font-mono text-muted">calculando…</span>
              </div>
            ) : (
              <Gauge score={score} grade={grade} color={GRADES[grade].color} className="max-w-[190px]" letterClass="text-5xl" />
            )}
          </div>
          <Terminal
            events={events}
            running={running}
            scanId={dataset.scanId}
            replay={replay.active}
            className="flex-1 min-h-[260px]"
            bodyClass="flex-1 min-h-0"
          />
        </aside>
      </div>

      <FindingTicker findings={dataset.findings} onOpenFinding={onOpenFinding} />
    </div>
  );
}

function MiniLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg/80 border border-border-2 text-[9px] font-mono uppercase tracking-widest text-subtle pointer-events-none">
      {icon} {text} · trocar
    </span>
  );
}

function RoundBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title?: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`min-w-7 h-7 px-1.5 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
        active ? 'bg-ok/20 text-ok' : 'text-subtle hover:text-foreground hover:bg-surface-3'
      }`}
    >
      {children}
    </button>
  );
}

function useSound() {
  const [on, setOn] = useState(sfx.isEnabled());
  useEffect(() => {
    const off = sfx.subscribe(setOn);
    return () => {
      off();
    };
  }, []);
  return { on, toggle: () => sfx.setEnabled(!on) };
}

/** Sonar a cada descoberta, aviso a cada ponto de atenção (só eventos novos). */
function useEventSounds(events: ApiScanEvent[], key: string) {
  const last = useRef<{ key: string; id: number } | null>(null);
  useEffect(() => {
    const newest = events[events.length - 1]?.id ?? 0;
    if (last.current?.key !== key) {
      // ao abrir a tela não toca o histórico inteiro (no replay ele começa vazio)
      last.current = { key, id: key.endsWith('true') ? 0 : newest };
      if (!key.endsWith('true')) return;
    }
    const fresh = events.filter((e) => e.id > last.current!.id);
    last.current.id = newest;
    if (fresh.some((e) => e.kind === 'warn' || e.kind === 'alert')) sfx.warn();
    else if (fresh.some((e) => e.kind === 'found')) sfx.ping();
  }, [events, key]);
}

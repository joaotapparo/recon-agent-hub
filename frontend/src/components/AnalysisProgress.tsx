import type { AnalysisStage } from '../types';

const ICONS: Record<string, React.ReactNode> = {
  recon: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />,
  infra: <path d="M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01" />,
  web: <path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Zm-3 9 2 2 4-4" />,
  js: <path d="m8 8-4 4 4 4m8-8 4 4-4 4M13.5 5l-3 14" />,
  ai: <path d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 5h4v4h-4z" />,
};

function StageNode({ stage, index }: { stage: AnalysisStage; index: number }) {
  const running = stage.status === 'running';
  const done = stage.status === 'completed';

  const ring = done
    ? 'border-ok bg-ok/15 text-ok'
    : running
      ? 'border-white bg-white/10 text-white animate-glow'
      : stage.status === 'failed'
        ? 'border-crit bg-crit/10 text-crit'
        : 'border-border-2 bg-surface-2 text-muted';

  return (
    <div className="flex flex-col items-center text-center min-w-0 flex-1">
      <div className={`relative w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors duration-500 ${ring}`}>
        {running && <span className="absolute inset-0 rounded-full border-2 border-white/60 animate-ping" />}
        {done ? (
          <svg key="done" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="animate-pop">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[stage.key]}
          </svg>
        )}
      </div>
      <p className={`mt-2 text-[10px] font-mono text-muted`}>ETAPA {index + 1}</p>
      <p className={`text-xs font-semibold ${stage.status === 'pending' ? 'text-muted' : 'text-foreground'}`}>{stage.name}</p>
      <p className="hidden md:block text-[11px] text-muted leading-snug mt-1 px-2 max-w-[200px]">{stage.description}</p>
    </div>
  );
}

function Connector({ from }: { from: AnalysisStage }) {
  const done = from.status === 'completed';
  const running = from.status === 'running';
  return (
    <div className="relative flex-1 max-w-[120px] h-0.5 mt-[21px] bg-surface-3 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-ok transition-all duration-700"
        style={{ width: done ? '100%' : running ? `${from.progress}%` : '0%' }}
      />
      {running && <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer" />}
    </div>
  );
}

interface Props {
  stages: AnalysisStage[];
}

export default function AnalysisProgress({ stages }: Props) {
  const totalProgress = Math.round(stages.reduce((s, st) => s + st.progress, 0) / stages.length);
  const running = stages.some((s) => s.status === 'running');

  return (
    <section className="bg-surface border border-border rounded-lg px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-600 text-base text-foreground tracking-wide">Progresso da Análise</h2>
        <span className="text-xs font-mono text-muted tabular-nums">{totalProgress}% concluído</span>
      </div>

      <div className="relative h-1.5 bg-surface-3 rounded-full overflow-hidden mb-6">
        <div
          className="h-full rounded-full bg-gradient-to-r from-white to-ok transition-all duration-700"
          style={{ width: `${totalProgress}%` }}
        />
        {running && <div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer" />}
      </div>

      <div className="flex items-start">
        {stages.map((stage, i) => (
          <div key={stage.key} className="contents">
            <StageNode stage={stage} index={i} />
            {i < stages.length - 1 && <Connector from={stage} />}
          </div>
        ))}
      </div>
    </section>
  );
}

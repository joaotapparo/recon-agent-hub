import { analysisStages as defaultStages } from '../mockData';
import type { AnalysisStage } from '../types';

function StageRow({ stage }: { stage: AnalysisStage }) {
  const icon =
    stage.status === 'completed' ? (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ) : stage.status === 'running' ? (
      <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin block" />
    ) : (
      <span className="w-3 h-3 rounded-full border border-border-2 block" />
    );

  const barColor =
    stage.status === 'completed' ? 'bg-ok' :
    stage.status === 'running'   ? 'bg-white' :
    'bg-surface-3';

  return (
    <div className="flex items-center gap-3">
      <div className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</div>
      <span className={`text-xs font-mono w-36 shrink-0 ${stage.status === 'pending' ? 'text-muted' : 'text-subtle'}`}>
        {stage.name}
      </span>
      <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${stage.progress}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted w-8 text-right shrink-0">{stage.progress}%</span>
    </div>
  );
}

interface Props {
  stages?: AnalysisStage[];
}

export default function AnalysisProgress({ stages = defaultStages }: Props) {
  const totalProgress = Math.round(
    stages.reduce((s, st) => s + st.progress, 0) / stages.length,
  );

  return (
    <section className="bg-surface border border-border rounded-lg px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-600 text-base text-foreground tracking-wide">Progresso da Análise</h2>
        <span className="text-xs font-mono text-muted">{totalProgress}% concluído</span>
      </div>

      {/* Overall bar */}
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-white to-ok transition-all duration-700"
          style={{ width: `${totalProgress}%` }}
        />
      </div>

      {/* Stage rows */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <StageRow key={stage.name} stage={stage} />
        ))}
      </div>
    </section>
  );
}

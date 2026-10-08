import { currentDomain as defaultDomain, analysisDate as defaultDate, analysisStatus as defaultStatus } from '../mockData';
import type { AnalysisStatus } from '../types';

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewScan?: () => void;
  domain?: string;
  date?: string;
  status?: AnalysisStatus;
}

const statusConfig = {
  completed: { label: 'CONCLUÍDA', cls: 'text-ok bg-ok/10 border-ok/25', dot: 'bg-ok' },
  running:   { label: 'EM ANDAMENTO', cls: 'text-accent bg-accent/10 border-accent/25', dot: 'bg-accent animate-pulse' },
  error:     { label: 'COM ERRO', cls: 'text-crit bg-crit/10 border-crit/25', dot: 'bg-crit' },
};

export default function Header({
  sidebarOpen,
  onToggleSidebar,
  onNewScan,
  domain = defaultDomain,
  date = defaultDate,
  status = defaultStatus,
}: Props) {
  const { label, cls, dot } = statusConfig[status];

  return (
    <header className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-3.5 flex items-center gap-4">
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-2 transition-colors shrink-0 cursor-pointer"
        aria-label="Toggle sidebar"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-700 text-xl text-foreground tracking-wide leading-none">
              {domain}
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-semibold tracking-widest border ${cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              {label}
            </span>
          </div>
          <p className="text-[11px] text-muted mt-1 font-mono">Análise realizada em {date}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onNewScan}
          className="group relative flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/20 hover:border-white/50 text-white font-mono text-xs font-semibold tracking-wider backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <div className="w-4 h-4 rounded-full bg-white/10 border border-white/30 flex items-center justify-center text-[10px] text-zinc-300 group-hover:text-white group-hover:rotate-90 transition-all">
            +
          </div>
          <span>NOVA ANÁLISE</span>
        </button>
      </div>
    </header>
  );
}

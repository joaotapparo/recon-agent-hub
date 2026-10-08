import { history as defaultHistory } from '../mockData';
import type { AnalysisStatus, HistoryItem } from '../types';

interface Props {
  open: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  onNewScan?: () => void;
  historyList?: HistoryItem[];
}

function StatusDot({ status }: { status: AnalysisStatus }) {
  const cls =
    status === 'completed' ? 'bg-ok' :
    status === 'running'   ? 'bg-accent animate-pulse' :
    'bg-crit';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls} shrink-0 mt-0.5`} />;
}

export default function Sidebar({
  open,
  activeId,
  onSelect,
  onNewScan,
  historyList = defaultHistory,
}: Props) {
  return (
    <aside
      className={`fixed top-0 left-0 h-full w-64 bg-surface border-r border-border flex flex-col z-20 transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="w-7 h-7 rounded bg-accent/15 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            <path d="M11 8v6M8 11h6"/>
          </svg>
        </div>
        <span className="font-display font-700 text-base text-foreground tracking-wide">ReconSec</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <p className="px-5 mb-3 text-[10px] font-mono font-medium text-muted tracking-widest uppercase">Histórico</p>
        <ul className="space-y-0.5 px-2">
          {historyList.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md group transition-colors cursor-pointer ${
                  activeId === item.id
                    ? 'bg-accent/10 border border-accent/20'
                    : 'hover:bg-surface-2 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <StatusDot status={item.status} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-mono truncate ${activeId === item.id ? 'text-accent' : 'text-foreground'}`}>
                      {item.domain}
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">{item.date}</p>
                    {item.findingsCount !== undefined && (
                      <p className="text-[10px] text-subtle mt-0.5">
                        {item.findingsCount} achado{item.findingsCount !== 1 ? 's' : ''}
                      </p>
                    )}
                    {item.status === 'running' && (
                      <p className="text-[10px] text-accent mt-0.5 animate-pulse">Escaneando...</p>
                    )}
                    {item.status === 'error' && (
                      <p className="text-[10px] text-crit mt-0.5">Com erro</p>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-4 border-t border-border">
        <button
          onClick={onNewScan}
          className="group w-full relative flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/20 hover:border-white/50 text-white font-mono text-xs font-semibold tracking-wider backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <div className="w-4 h-4 rounded-full bg-white/10 border border-white/30 flex items-center justify-center text-[10px] text-zinc-300 group-hover:text-white group-hover:rotate-90 transition-all">
            +
          </div>
          <span>NOVA ANÁLISE</span>
        </button>
      </div>
    </aside>
  );
}

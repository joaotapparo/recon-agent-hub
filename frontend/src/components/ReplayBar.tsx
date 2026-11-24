interface Props {
  active: boolean;
  finished: boolean;
  paused: boolean;
  speed: number;
  progress: number;
  onStart: () => void;
  onStop: () => void;
  onTogglePause: () => void;
  onSpeed: (speed: number) => void;
}

const SPEEDS = [1, 2, 4];

export default function ReplayBar({ active, finished, paused, speed, progress, onStart, onStop, onTogglePause, onSpeed }: Props) {
  if (!active) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Modo demonstração</p>
          <p className="text-[11px] text-muted">
            Reproduz esta análise do zero em cerca de 1 minuto, com radar, terminal e mapa, sem rodar nada de novo.
          </p>
        </div>
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-transform"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          Reproduzir análise
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ok/40 bg-ok/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-ok">
          <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
          {finished ? 'Demonstração concluída' : 'Demonstração em andamento'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {finished ? (
            <Btn onClick={onStart}>↺ Repetir</Btn>
          ) : (
            <Btn onClick={onTogglePause}>{paused ? '▶ Continuar' : '❚❚ Pausar'}</Btn>
          )}
          {SPEEDS.map((s) => (
            <Btn key={s} onClick={() => onSpeed(s)} active={s === speed}>
              {s}x
            </Btn>
          ))}
          <Btn onClick={onStop}>✕ Sair</Btn>
        </div>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-surface-3 overflow-hidden">
        <div className="h-full bg-ok transition-all duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}

function Btn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded border text-[10px] font-mono uppercase tracking-wider cursor-pointer transition-colors ${
        active ? 'border-ok/60 text-ok bg-ok/10' : 'border-border-2 text-subtle hover:text-foreground hover:bg-surface-3'
      }`}
    >
      {children}
    </button>
  );
}

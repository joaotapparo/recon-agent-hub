import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Globe2, LayoutDashboard, Link2, ListChecks, MonitorPlay, Network, Server, FileText, Tv, X } from 'lucide-react';

export type TabId = 'resumo' | 'mapa' | 'globo' | 'cadeias' | 'achados' | 'infra' | 'relatorio';

export const TABS: { id: TabId; label: string; icon: typeof Globe2 }[] = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { id: 'mapa', label: 'Mapa', icon: Network },
  { id: 'globo', label: 'Globo', icon: Globe2 },
  { id: 'cadeias', label: 'Cadeias', icon: Link2 },
  { id: 'achados', label: 'Achados', icon: ListChecks },
  { id: 'infra', label: 'Infra e código', icon: Server },
  { id: 'relatorio', label: 'Relatório', icon: FileText },
];

interface NavProps {
  active: TabId;
  onSelect: (id: TabId) => void;
  badges?: Partial<Record<TabId, number>>;
  presenting: boolean;
  onTogglePresent: () => void;
  tv: boolean;
  onToggleTv?: () => void;
}

export default function TabNav({ active, onSelect, badges, presenting, onTogglePresent, tv, onToggleTv }: NavProps) {
  return (
    <nav className="sticky top-0 z-20 -mx-5 px-5 py-2.5 bg-bg/80 backdrop-blur-md border-b border-border flex items-center gap-2">
      <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {TABS.map((t, i) => {
          const on = active === t.id;
          const Icon = t.icon;
          const badge = badges?.[t.id];
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`relative shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                on ? 'text-zinc-950' : 'text-muted hover:text-foreground'
              }`}
            >
              {on && (
                <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-zinc-100" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
              )}
              <span className="relative flex items-center gap-1.5">
                <Icon size={13} />
                {t.label}
                {badge ? (
                  <span className={`text-[9px] font-mono px-1.5 rounded-full ${on ? 'bg-zinc-300 text-zinc-800' : 'bg-surface-3 text-subtle'}`}>{badge}</span>
                ) : null}
                <span className={`hidden xl:inline text-[9px] font-mono ${on ? 'text-zinc-500' : 'text-zinc-600'}`}>{i + 1}</span>
              </span>
            </button>
          );
        })}
      </div>
      {onToggleTv && (
        <button
          onClick={onToggleTv}
          title="Modo TV: repete a demonstração em loop (bom para estande ou projetor)"
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs border cursor-pointer transition-colors ${
            tv ? 'border-violet-400/50 text-violet-300 bg-violet-500/10' : 'border-border-2 text-subtle hover:text-foreground hover:border-subtle/50'
          }`}
        >
          <Tv size={13} /> {tv ? 'TV ligada' : 'Modo TV'}
        </button>
      )}
      <button
        onClick={onTogglePresent}
        title="Modo apresentação (P)"
        className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs border cursor-pointer transition-colors ${
          presenting ? 'border-crit/50 text-crit bg-crit/10' : 'border-border-2 text-subtle hover:text-foreground hover:border-subtle/50'
        }`}
      >
        {presenting ? <X size={13} /> : <MonitorPlay size={13} />}
        {presenting ? 'Sair' : 'Apresentar'}
      </button>
    </nav>
  );
}

/**
 * Modo apresentação: tela cheia, fonte maior, sem barra lateral, e teclado
 * (1–7 abas, ←/→ entre abas, P liga/desliga, Esc sai).
 */
export function usePresentation(active: TabId, onSelect: (id: TabId) => void, onEnter: () => void) {
  const [presenting, setPresenting] = useState(false);
  const [hint, setHint] = useState(false);

  const enter = useCallback(() => {
    setPresenting(true);
    setHint(true);
    onEnter();
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, [onEnter]);

  const exit = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  const toggle = useCallback(() => (presenting ? exit() : enter()), [presenting, enter, exit]);

  useEffect(() => {
    document.documentElement.classList.toggle('presenting', presenting);
    return () => document.documentElement.classList.remove('presenting');
  }, [presenting]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 4000);
    return () => clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = TABS.findIndex((t) => t.id === active);
      if (/^[1-7]$/.test(e.key)) {
        onSelect(TABS[Number(e.key) - 1].id);
      } else if (e.key === 'p' || e.key === 'P') {
        toggle();
      } else if (presenting && ['ArrowRight', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        onSelect(TABS[Math.min(TABS.length - 1, idx + 1)].id);
      } else if (presenting && ['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        onSelect(TABS[Math.max(0, idx - 1)].id);
      } else if (e.key === 'Escape' && presenting) {
        exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onSelect, presenting, toggle, exit]);

  const hud = (
    <AnimatePresence>
      {presenting && hint && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-full bg-surface-2/95 border border-border-2 backdrop-blur text-[11px] font-mono text-subtle shadow-2xl"
        >
          ← → trocar de aba · 1–7 ir direto · Esc sair
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { presenting, toggle, exit, hud };
}

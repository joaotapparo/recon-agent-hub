import { useCallback, useEffect, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MonitorPlay, X } from 'lucide-react';

export interface SectionDef {
  id: string;
  label: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'ao-vivo', label: 'Ao vivo' },
  { id: 'grafo', label: 'Grafo' },
  { id: 'globo', label: 'Globo' },
  { id: 'cadeias', label: 'Cadeias' },
  { id: 'sites', label: 'Sites' },
  { id: 'achados', label: 'Achados' },
  { id: 'infra', label: 'Infra e código' },
  { id: 'relatorio', label: 'Relatório' },
];

/** Seção visível no momento (scroll-spy dentro do <main>). */
export function useActiveSection(rootRef: RefObject<HTMLElement | null>, ids: string[], deps: unknown[] = []): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        const best = ids.filter((id) => (visible.get(id) ?? 0) > 0).sort((a, b) => (visible.get(b) ?? 0) - (visible.get(a) ?? 0))[0];
        if (best) setActive(best);
      },
      { root, threshold: [0, 0.15, 0.35, 0.6, 0.9], rootMargin: '-80px 0px -35% 0px' },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, ids.join(','), ...deps]);
  return active;
}

export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface NavProps {
  sections: SectionDef[];
  active: string | null;
  presenting: boolean;
  onTogglePresent: () => void;
}

export default function SectionNav({ sections, active, presenting, onTogglePresent }: NavProps) {
  return (
    <nav className="sticky top-0 z-20 -mx-5 -mt-5 px-5 py-2 bg-bg/80 backdrop-blur-md border-b border-border flex items-center gap-2">
      <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {sections.map((s, i) => {
          const on = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className={`relative shrink-0 px-3 py-1.5 rounded-full text-[11px] font-mono cursor-pointer transition-colors ${
                on ? 'text-zinc-950' : 'text-muted hover:text-foreground'
              }`}
            >
              {on && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-zinc-100"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">
                <span className={on ? 'text-zinc-500' : 'text-zinc-600'}>{i + 1}</span> {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onTogglePresent}
        title="Modo apresentação (P)"
        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border cursor-pointer transition-colors ${
          presenting ? 'border-crit/50 text-crit bg-crit/10' : 'border-border-2 text-subtle hover:text-foreground hover:border-subtle/50'
        }`}
      >
        {presenting ? <X size={12} /> : <MonitorPlay size={12} />}
        {presenting ? 'Sair' : 'Apresentar'}
      </button>
    </nav>
  );
}

/**
 * Modo apresentação: tela cheia, fonte maior, sem barra lateral, e teclado
 * para navegar (1-9 seções, ←/→ ou PageUp/PageDown, P liga/desliga, Esc sai).
 */
export function usePresentation(sections: SectionDef[], active: string | null, onEnter: () => void) {
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
    // Esc do navegador sai da tela cheia: sai do modo também
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
      const idx = sections.findIndex((s) => s.id === active);
      if (/^[1-9]$/.test(e.key)) {
        const s = sections[Number(e.key) - 1];
        if (s) {
          e.preventDefault();
          scrollToSection(s.id);
        }
      } else if (e.key === 'p' || e.key === 'P') {
        toggle();
      } else if (presenting && ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        const s = sections[Math.min(sections.length - 1, idx + 1)];
        if (s) scrollToSection(s.id);
      } else if (presenting && ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        const s = sections[Math.max(0, idx - 1)];
        if (s) scrollToSection(s.id);
      } else if (e.key === 'Escape' && presenting) {
        exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sections, active, presenting, toggle, exit]);

  const hud = (
    <AnimatePresence>
      {presenting && hint && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-full bg-surface-2/95 border border-border-2 backdrop-blur text-[11px] font-mono text-subtle shadow-2xl"
        >
          ← → navegar · 1–9 ir para a seção · Esc sair
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { presenting, toggle, hud };
}

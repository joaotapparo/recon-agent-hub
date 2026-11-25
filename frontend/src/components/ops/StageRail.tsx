import { motion } from 'motion/react';
import { Bot, Check, Code2, Radar as RadarIcon, Server, ShieldCheck } from 'lucide-react';
import type { AnalysisStage } from '../../types';

const ICON: Record<string, typeof Check> = {
  recon: RadarIcon,
  infra: Server,
  web: ShieldCheck,
  js: Code2,
  ai: Bot,
};

/** Etapas do pipeline na vertical, com a atual pulsando. */
export default function StageRail({ stages }: { stages: AnalysisStage[] }) {
  return (
    <ol className="relative space-y-1">
      {stages.map((s, i) => {
        const Icon = s.status === 'completed' ? Check : ICON[s.key] ?? Check;
        const running = s.status === 'running';
        const done = s.status === 'completed';
        return (
          <li key={s.key} className="relative flex items-start gap-3 py-1.5">
            {i < stages.length - 1 && (
              <span className="absolute left-[15px] top-9 bottom-[-10px] w-px bg-border-2 overflow-hidden">
                <motion.span
                  className="absolute inset-x-0 top-0 bg-ok"
                  initial={false}
                  animate={{ height: done ? '100%' : '0%' }}
                  transition={{ duration: 0.6 }}
                />
              </span>
            )}
            <span
              className={`relative z-10 shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors duration-500 ${
                done
                  ? 'border-ok bg-ok/15 text-ok'
                  : running
                    ? 'border-white bg-white/10 text-white'
                    : 'border-border-2 bg-surface-2 text-muted'
              }`}
            >
              {running && <span className="absolute inset-0 rounded-full border-2 border-white/60 animate-ping" />}
              <Icon size={14} strokeWidth={done ? 3 : 2} />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className={`block text-xs font-semibold ${s.status === 'pending' ? 'text-muted' : 'text-foreground'}`}>{s.name}</span>
              <span className={`block text-[10px] font-mono ${running ? 'text-ok' : 'text-muted'}`}>
                {running ? 'em andamento…' : done ? 'concluída' : s.tool}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

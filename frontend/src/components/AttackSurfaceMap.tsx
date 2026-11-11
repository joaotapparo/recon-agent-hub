import { useMemo, useState } from 'react';
import type { Finding, Subdomain } from '../types';

const MAX_NODES = 28;

type Risk = 'critical' | 'warning' | 'ok' | 'offline';

const RISK: Record<Risk, { fill: string; label: string }> = {
  critical: { fill: '#f87171', label: 'Risco alto/crítico' },
  warning: { fill: '#facc15', label: 'Pontos de atenção' },
  ok: { fill: '#22c55e', label: 'No ar, sem achados' },
  offline: { fill: '#3f3f46', label: 'Fora do ar' },
};

function hostOf(target: string): string {
  try {
    return new URL(target).hostname;
  } catch {
    return target;
  }
}

function riskFor(sub: Subdomain, findings: Finding[]): Risk {
  if (sub.status === 'inactive') return 'offline';
  const mine = findings.filter((f) => f.status !== 'false_positive' && f.type !== 'open_port' && hostOf(f.target) === sub.host);
  if (mine.some((f) => f.severity === 'critical' || f.severity === 'high')) return 'critical';
  if (mine.length) return 'warning';
  return 'ok';
}

interface Props {
  domain: string;
  subdomains: Subdomain[];
  findings: Finding[];
  running: boolean;
  /** URL do print da página inicial, quando existir */
  screenshotOf?: (host: string) => string | undefined;
}

export default function AttackSurfaceMap({ domain, subdomains, findings, running, screenshotOf }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const nodes = useMemo(() => {
    // ativos primeiro: são os que importam se a lista for cortada
    const sorted = [...subdomains].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
    const shown = sorted.slice(0, MAX_NODES);
    const twoRings = shown.length > 12;
    return shown.map((sub, i) => {
      const ring = twoRings && i % 2 === 1 ? 1 : 0;
      const angle = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
      const radius = ring ? 95 : 145;
      return {
        sub,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.78,
        angle,
        risk: riskFor(sub, findings),
        label: sub.host === domain ? domain : sub.host.replace(`.${domain}`, ''),
      };
    });
  }, [subdomains, findings, domain]);

  const hidden = subdomains.length - nodes.length;
  const showLabels = nodes.length <= 14;
  const hovered = nodes.find((n) => n.sub.host === hover);

  return (
    <section className="bg-surface border border-border rounded-lg p-5 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-600 text-base text-foreground tracking-wide">Mapa da superfície de ataque</h2>
        <span className="text-[10px] font-mono text-muted">{subdomains.length} endereço(s)</span>
      </div>
      <p className="text-xs text-muted mb-3">
        Cada ponto é um endereço da empresa visível na internet. Os satélites são portas abertas.
      </p>

      <div className="relative flex-1 min-h-[300px]">
        <svg viewBox="-200 -150 400 300" className="w-full h-full" role="img" aria-label={`Mapa de ${domain}`}>
          <defs>
            <radialGradient id="core-glow">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {nodes.map((n, i) => (
            <line
              key={`l-${n.sub.host}`}
              x1={0} y1={0} x2={n.x} y2={n.y}
              stroke={n.risk === 'offline' ? '#27272a' : RISK[n.risk].fill}
              strokeOpacity={hover && hover !== n.sub.host ? 0.08 : 0.3}
              strokeDasharray={running ? '3 5' : undefined}
              className={`animate-node-in ${running && n.risk !== 'offline' ? 'animate-dash' : ''}`}
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}

          <circle r="38" fill="url(#core-glow)" />
          {running && <circle r="16" fill="none" stroke="#ffffff" strokeOpacity="0.4" className="animate-ring" />}
          <circle r="14" fill="#18181b" stroke="#fafafa" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" fontSize="10" fill="#fafafa" fontFamily="monospace">◎</text>
          <text y="30" textAnchor="middle" fontSize="9" fill="#fafafa" fontFamily="monospace">{domain}</text>

          {nodes.map((n, i) => {
            const color = RISK[n.risk].fill;
            const r = n.risk === 'offline' ? 4 : 7;
            const dim = hover && hover !== n.sub.host;
            return (
              <g
                key={n.sub.host}
                transform={`translate(${n.x} ${n.y})`}
                onMouseEnter={() => setHover(n.sub.host)}
                onMouseLeave={() => setHover(null)}
                opacity={dim ? 0.3 : 1}
                style={{ cursor: 'default', transition: 'opacity .2s' }}
              >
                <g className="animate-node-in" style={{ animationDelay: `${i * 60 + 120}ms` }}>
                  {n.risk === 'critical' && <circle r={r + 2} fill="none" stroke={color} className="animate-ring" />}
                  {n.sub.ports.slice(0, 8).map((port, j, arr) => {
                    const a = (j / arr.length) * Math.PI * 2;
                    return <circle key={port} cx={Math.cos(a) * 13} cy={Math.sin(a) * 13} r="2" fill="#a1a1aa" />;
                  })}
                  <circle r={r} fill={color} fillOpacity={n.risk === 'offline' ? 0.6 : 0.9} stroke="#09090b" strokeWidth="1.5" />
                  {showLabels && (
                    <text
                      y={n.y >= 0 ? 22 : -16}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill={n.risk === 'offline' ? '#52525b' : '#a1a1aa'}
                      fontFamily="monospace"
                    >
                      {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div className="absolute top-2 left-2 bg-surface-2 border border-border-2 rounded px-3 py-2 text-[11px] font-mono pointer-events-none max-w-[70%]">
            {screenshotOf?.(hovered.sub.host) && (
              <img
                src={screenshotOf(hovered.sub.host)}
                alt=""
                className="w-56 aspect-[16/10] object-cover object-top rounded border border-border mb-1.5"
              />
            )}
            <p className="text-foreground break-all">{hovered.sub.host}</p>
            <p className="text-muted">
              {hovered.sub.ip ?? 'sem IP'} · {hovered.sub.ports.length ? `portas ${hovered.sub.ports.join(', ')}` : 'sem portas abertas'}
            </p>
            <p style={{ color: RISK[hovered.risk].fill }}>{RISK[hovered.risk].label}</p>
          </div>
        )}
        {subdomains.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted">
            {running ? 'Mapeando endereços…' : 'Nenhum endereço encontrado.'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {(Object.keys(RISK) as Risk[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[10px] font-mono text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: RISK[k].fill }} />
            {RISK[k].label}
          </span>
        ))}
        {hidden > 0 && <span className="text-[10px] font-mono text-muted">+{hidden} não exibidos</span>}
      </div>
    </section>
  );
}

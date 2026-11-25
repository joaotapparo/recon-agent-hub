import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { motion } from 'motion/react';
import { Crosshair, Maximize2, Minimize2, Network } from 'lucide-react';
import type { Finding, OpenPort, Subdomain } from '../types';
import { RISK_COLOR, SEV_COLOR, hostOf, riskFor } from '../lib/hosts';
import { SEV_RANK, isIssue } from '../lib/score';
import { typeLabel } from '../utils';

type Kind = 'domain' | 'host' | 'port' | 'tech' | 'finding';

interface GNode {
  id: string;
  kind: Kind;
  label: string;
  color: string;
  r: number;
  /** host que este nó representa (ou ao qual pertence) */
  host?: string;
  findingId?: string;
  pulse?: boolean;
  /** instante em que apareceu, para a animação de "nascer" */
  born: number;
}

interface GLink {
  source: string;
  target: string;
  color: string;
  hot?: boolean;
}

type N = NodeObject<GNode>;
type L = LinkObject<GNode, GLink>;

const MAX_FINDING_NODES = 90;

const KIND_LABEL: Record<Kind, string> = {
  domain: 'Domínio',
  host: 'Endereço',
  port: 'Porta aberta',
  tech: 'Tecnologia',
  finding: 'Achado',
};

interface Props {
  domain: string;
  subdomains: Subdomain[];
  findings: Finding[];
  openPorts: OpenPort[];
  running: boolean;
  onOpenHost: (host: string) => void;
  onOpenFinding: (id: string) => void;
}

function techName(t: string): string {
  return t.split(':')[0].trim();
}

export default function AttackGraph({ domain, subdomains, findings, openPorts, running, onOpenHost, onOpenFinding }: Props) {
  const fgRef = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(new Map<string, N>());
  const fitted = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [layers, setLayers] = useState({ port: true, tech: true, finding: true });
  const [hover, setHover] = useState<N | null>(null);
  const [full, setFull] = useState(false);

  // tamanho do canvas acompanha o container
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === boxRef.current?.parentElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // troca de domínio: começa do zero
  useEffect(() => {
    nodesRef.current.clear();
    fitted.current = false;
  }, [domain]);

  // chave estrutural: o polling devolve objetos novos a cada 3s, mas o grafo só
  // deve mudar (e reaquecer a física) quando algo de fato mudou
  const key = useMemo(
    () =>
      JSON.stringify([
        subdomains.map((s) => [s.host, s.status, s.tech, s.ports]),
        findings.filter(isIssue).map((f) => [f.id, f.severity, f.status]),
        layers,
      ]),
    [subdomains, findings, layers],
  );

  const graph = useMemo(() => {
    const now = performance.now();
    const prev = nodesRef.current;
    const next = new Map<string, N>();
    const links: GLink[] = [];

    const put = (id: string, data: Omit<GNode, 'id' | 'born'>, parent?: string) => {
      const old = prev.get(id);
      if (old) {
        Object.assign(old, data);
        next.set(id, old);
        return;
      }
      // nasce perto do pai, para "brotar" dele
      const p = parent ? next.get(parent) ?? prev.get(parent) : undefined;
      const jitter = () => (Math.random() - 0.5) * 20;
      next.set(id, { id, born: now, ...data, x: (p?.x ?? 0) + jitter(), y: (p?.y ?? 0) + jitter() } as N);
    };

    const apex = subdomains.find((s) => s.host === domain);
    put('domain', {
      kind: 'domain',
      label: domain,
      color: '#fafafa',
      r: 9,
      host: apex ? domain : undefined,
      pulse: running,
    });
    const domainNode = next.get('domain')!;
    domainNode.fx = 0;
    domainNode.fy = 0;

    const hostId = (h: string) => (h === domain ? 'domain' : `host:${h}`);

    for (const sub of subdomains) {
      const risk = riskFor(sub, findings);
      if (sub.host !== domain) {
        put(hostId(sub.host), {
          kind: 'host',
          label: sub.host.replace(`.${domain}`, ''),
          color: RISK_COLOR[risk],
          r: sub.status === 'active' ? 5.5 : 3.5,
          host: sub.host,
          pulse: risk === 'critical',
        }, 'domain');
        links.push({ source: 'domain', target: hostId(sub.host), color: RISK_COLOR[risk], hot: risk === 'critical' });
      } else if (risk === 'critical') {
        domainNode.pulse = true;
        domainNode.color = RISK_COLOR.critical;
      }

      if (layers.port) {
        for (const port of sub.ports) {
          const id = `port:${sub.host}:${port}`;
          const svc = openPorts.find((p) => p.host === sub.host && p.port === port)?.service;
          put(id, { kind: 'port', label: `${port}${svc && svc !== '—' ? ` ${svc}` : ''}`, color: '#a1a1aa', r: 2.2, host: sub.host }, hostId(sub.host));
          links.push({ source: hostId(sub.host), target: id, color: '#52525b' });
        }
      }
      if (layers.tech) {
        for (const t of new Set(sub.tech.map(techName))) {
          const id = `tech:${t.toLowerCase()}`;
          put(id, { kind: 'tech', label: t, color: '#38bdf8', r: 3 }, hostId(sub.host));
          links.push({ source: hostId(sub.host), target: id, color: '#0ea5e955' });
        }
      }
    }

    if (layers.finding) {
      const known = new Set(subdomains.map((s) => s.host));
      const issues = findings
        .filter(isIssue)
        .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])
        .slice(0, MAX_FINDING_NODES);
      for (const f of issues) {
        const h = hostOf(f.target);
        const parent = known.has(h) ? hostId(h) : 'domain';
        const id = `finding:${f.id}`;
        const sev = SEV_RANK[f.severity];
        put(id, {
          kind: 'finding',
          label: f.title,
          color: f.status === 'confirmed' ? SEV_COLOR[f.severity] : '#71717a',
          r: 2.5 + sev * 0.7,
          host: known.has(h) ? h : undefined,
          findingId: f.id,
          pulse: f.status === 'confirmed' && sev >= 5,
        }, parent);
        links.push({ source: parent, target: id, color: SEV_COLOR[f.severity] + '88', hot: f.status === 'confirmed' && sev >= 4 });
      }
    }

    nodesRef.current = next;
    return { nodes: [...next.values()], links: links as unknown as L[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, domain, running]);

  // física: repele mais quando há muitos nós
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(graph.nodes.length > 60 ? -45 : -90);
    const link = fg.d3Force('link') as unknown as { distance?: (fn: (l: L) => number) => void } | undefined;
    link?.distance?.((l) => {
      const t = l.target as N;
      return t.kind === 'host' ? 70 : t.kind === 'tech' ? 55 : 26;
    });
  }, [graph]);

  const neighbors = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover.id]);
    for (const l of graph.links) {
      const s = typeof l.source === 'object' ? (l.source as N).id : String(l.source);
      const t = typeof l.target === 'object' ? (l.target as N).id : String(l.target);
      if (s === hover.id) set.add(t);
      if (t === hover.id) set.add(s);
    }
    return set;
  }, [hover, graph]);

  const draw = useCallback(
    (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
      const now = performance.now();
      const age = Math.min(1, (now - node.born) / 600);
      const grow = 1 - Math.pow(1 - age, 3); // ease-out
      const r = node.r * (0.2 + 0.8 * grow);
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const dim = neighbors && !neighbors.has(node.id);
      ctx.globalAlpha = dim ? 0.15 : 1;

      if (node.pulse && !dim) {
        const t = (now % 1600) / 1600;
        ctx.beginPath();
        ctx.arc(x, y, r + 2 + t * 12, 0, Math.PI * 2);
        ctx.strokeStyle = node.color;
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.lineWidth = 1.2 / scale + 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // brilho
      if (node.kind !== 'port') {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        g.addColorStop(0, node.color + '55');
        g.addColorStop(1, node.color + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      if (node.kind === 'tech') {
        // losango
        ctx.moveTo(x, y - r * 1.2);
        ctx.lineTo(x + r * 1.2, y);
        ctx.lineTo(x, y + r * 1.2);
        ctx.lineTo(x - r * 1.2, y);
        ctx.closePath();
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = node.kind === 'domain' ? '#18181b' : node.color;
      ctx.fill();
      ctx.lineWidth = node.kind === 'domain' ? 2 : 0.8;
      ctx.strokeStyle = node.kind === 'domain' ? node.color : '#09090b';
      ctx.stroke();

      const isHover = hover?.id === node.id;
      const showLabel =
        node.kind === 'domain' ||
        isHover ||
        (neighbors?.has(node.id) ?? false) ||
        (node.kind === 'host' && scale > 0.9) ||
        (node.kind === 'tech' && scale > 1.4) ||
        scale > 2.6;
      if (showLabel && grow > 0.6) {
        const size = Math.max(10 / scale, node.kind === 'domain' ? 4.5 : 3);
        ctx.font = `${node.kind === 'domain' || isHover ? 600 : 400} ${size}px "Share Tech Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const text = node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label;
        ctx.fillStyle = dim ? '#3f3f46' : node.kind === 'finding' ? node.color : '#d4d4d8';
        ctx.fillText(text, x, y + r + 2);
      }
      ctx.globalAlpha = 1;
    },
    [hover, neighbors],
  );

  const paintArea = useCallback((node: N, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, node.r + 3, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const handleClick = useCallback(
    (node: N) => {
      const fg = fgRef.current;
      if (fg && node.x != null && node.y != null) {
        fg.centerAt(node.x, node.y, 700);
        fg.zoom(2.4, 700);
      }
      if (node.kind === 'finding' && node.findingId) {
        setTimeout(() => onOpenFinding(node.findingId!), 450);
      } else if (node.host) {
        setTimeout(() => onOpenHost(node.host!), 450);
      }
    },
    [onOpenFinding, onOpenHost],
  );

  const fit = () => fgRef.current?.zoomToFit(700, 50);

  const toggleFull = () => {
    const el = boxRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { domain: 0, host: 0, port: 0, tech: 0, finding: 0 };
    for (const n of graph.nodes) c[n.kind]++;
    return c;
  }, [graph]);

  return (
    <section className={`relative bg-surface border border-border rounded-xl overflow-hidden flex flex-col ${full ? 'bg-bg' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
        <div>
          <h2 className="font-display font-600 text-base text-foreground tracking-wide flex items-center gap-2">
            <Network size={16} /> Grafo da superfície de ataque
          </h2>
          <p className="text-xs text-muted">
            Clique num ponto para ver os detalhes. Arraste para mover, role para dar zoom.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['port', 'tech', 'finding'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
              className={`text-[10px] font-mono px-2 py-1 rounded border cursor-pointer transition-colors ${
                layers[k] ? 'text-foreground border-border-2 bg-surface-2' : 'text-muted border-border line-through'
              }`}
            >
              {k === 'port' ? 'portas' : k === 'tech' ? 'tecnologias' : 'achados'}
            </button>
          ))}
          <button onClick={fit} title="Centralizar" className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-2 cursor-pointer">
            <Crosshair size={14} />
          </button>
          <button onClick={toggleFull} title="Tela cheia" className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-2 cursor-pointer">
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <div ref={boxRef} className={`relative ${full ? 'flex-1' : 'h-[520px]'} bg-[radial-gradient(ellipse_at_center,#18181b_0%,#09090b_70%)]`}>
        <ForceGraph2D<GNode, GLink>
          ref={fgRef}
          graphData={graph as never}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          nodeCanvasObject={draw}
          nodePointerAreaPaint={paintArea}
          nodeLabel={() => ''}
          linkColor={(l) => {
            const s = (l.source as N)?.id;
            const t = (l.target as N)?.id;
            if (neighbors && !(neighbors.has(s) && neighbors.has(t))) return '#ffffff08';
            return (l as unknown as GLink).color;
          }}
          linkWidth={(l) => ((l as unknown as GLink).hot ? 1.6 : 0.6)}
          linkDirectionalParticles={(l) => ((l as unknown as GLink).hot ? 3 : running ? 1 : 0)}
          linkDirectionalParticleWidth={(l) => ((l as unknown as GLink).hot ? 2.4 : 1.4)}
          linkDirectionalParticleSpeed={(l) => ((l as unknown as GLink).hot ? 0.012 : 0.006)}
          linkDirectionalParticleColor={(l) => ((l as unknown as GLink).hot ? '#f87171' : '#a1a1aa')}
          autoPauseRedraw={false}
          cooldownTicks={180}
          d3VelocityDecay={0.3}
          onNodeHover={(n) => setHover(n)}
          onNodeClick={handleClick}
          onBackgroundClick={() => setHover(null)}
          onEngineStop={() => {
            if (!fitted.current && graph.nodes.length > 1) {
              fitted.current = true;
              fit();
            }
          }}
          showPointerCursor={(o) => Boolean(o && 'kind' in (o as object))}
        />

        {hover && (
          <motion.div
            key={hover.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-3 left-3 max-w-xs bg-surface-2/95 backdrop-blur border border-border-2 rounded-lg px-3 py-2 pointer-events-none"
          >
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: hover.color }}>
              {KIND_LABEL[hover.kind]}
            </p>
            <p className="text-xs text-foreground break-all">{hover.kind === 'finding' ? hover.label : hover.host ?? hover.label}</p>
            {hover.kind === 'finding' && hover.findingId && (
              <p className="text-[10px] font-mono text-muted">
                {typeLabel[findings.find((f) => f.id === hover.findingId)?.type ?? ''] ?? ''} · clique para abrir
              </p>
            )}
            {(hover.kind === 'host' || (hover.kind === 'domain' && hover.host)) && (
              <p className="text-[10px] font-mono text-muted">clique para ver o endereço</p>
            )}
          </motion.div>
        )}

        {subdomains.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted pointer-events-none">
            {running ? 'Mapeando endereços…' : 'Nenhum endereço encontrado.'}
          </div>
        )}

        <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 bg-bg/70 backdrop-blur rounded-lg px-3 py-2 pointer-events-none">
          <Legend color={RISK_COLOR.critical} label="host em risco" />
          <Legend color={RISK_COLOR.warning} label="atenção" />
          <Legend color={RISK_COLOR.ok} label="ok" />
          <Legend color="#38bdf8" label="tecnologia" diamond />
          <Legend color="#a1a1aa" label="porta" />
        </div>
        <div className="absolute bottom-3 right-3 text-[10px] font-mono text-muted bg-bg/70 backdrop-blur rounded-lg px-3 py-2 pointer-events-none">
          {counts.host + (graph.nodes.find((n) => n.id === 'domain')?.host ? 1 : 0)} endereços · {counts.port} portas · {counts.tech} tecnologias · {counts.finding} achados
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label, diamond }: { color: string; label: string; diamond?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-mono text-subtle">
      <span className={`w-2 h-2 ${diamond ? 'rotate-45' : 'rounded-full'}`} style={{ background: color }} />
      {label}
    </span>
  );
}

import { AnimatePresence, motion } from 'motion/react';
import { Globe2, Server, Shield, ShieldOff, X, Cpu, ExternalLink } from 'lucide-react';
import type { Finding, OpenPort, Subdomain } from '../types';
import { RISK_COLOR, RISK_LABEL, findingsForHost, riskFor } from '../lib/hosts';
import { SEV_RANK } from '../lib/score';
import { SeverityBadge, StatusBadge, typeLabel } from '../utils';

interface Props {
  host: string | null;
  subdomains: Subdomain[];
  findings: Finding[];
  openPorts: OpenPort[];
  screenshotOf?: (host: string) => string | undefined;
  onClose: () => void;
  onOpenFinding: (id: string) => void;
}

/** Tudo sobre um endereço: print, rede, tecnologias e os achados dele. */
export default function HostDrawer({ host, subdomains, findings, openPorts, screenshotOf, onClose, onOpenFinding }: Props) {
  const sub = host ? subdomains.find((s) => s.host === host) : undefined;

  return (
    <AnimatePresence>
      {host && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-2 border-l border-border-2 z-40 overflow-y-auto shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <Body
              host={host}
              sub={sub}
              findings={findings}
              openPorts={openPorts}
              screenshot={screenshotOf?.(host)}
              onClose={onClose}
              onOpenFinding={onOpenFinding}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Body({
  host,
  sub,
  findings,
  openPorts,
  screenshot,
  onClose,
  onOpenFinding,
}: {
  host: string;
  sub?: Subdomain;
  findings: Finding[];
  openPorts: OpenPort[];
  screenshot?: string;
  onClose: () => void;
  onOpenFinding: (id: string) => void;
}) {
  const mine = findingsForHost(host, findings).sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
  const ports = openPorts.filter((p) => p.host === host);
  const risk = sub ? riskFor(sub, findings) : mine.length ? 'warning' : 'ok';
  const stagger = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.1 + i * 0.06 } });

  return (
    <>
      <div className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur border-b border-border px-5 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono tracking-widest uppercase mb-1 flex items-center gap-1.5" style={{ color: RISK_COLOR[risk] }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: RISK_COLOR[risk] }} />
            {RISK_LABEL[risk]}
          </p>
          <h3 className="font-display font-600 text-xl text-foreground leading-snug break-all">{host}</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-3 transition-colors cursor-pointer" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {screenshot && (
          <motion.a {...stagger(0)} href={`http://${host}`} target="_blank" rel="noreferrer noopener" className="group block relative rounded-lg overflow-hidden border border-border-2">
            <img src={screenshot} alt={`Página inicial de ${host}`} className="w-full aspect-[16/10] object-cover object-top group-hover:scale-[1.03] transition-transform duration-500" />
            <span className="absolute bottom-2 right-2 text-[10px] font-mono bg-black/70 text-white px-2 py-1 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              abrir site <ExternalLink size={10} />
            </span>
          </motion.a>
        )}

        <motion.div {...stagger(1)} className="grid grid-cols-2 gap-2">
          <Info icon={<Globe2 size={12} />} label="IP" value={sub?.ip ?? '—'} />
          <Info icon={<Server size={12} />} label="HTTP" value={sub?.httpStatus ? String(sub.httpStatus) : 'fora do ar'} />
          <Info
            icon={sub?.waf ? <Shield size={12} /> : <ShieldOff size={12} />}
            label="Firewall (WAF)"
            value={sub?.waf == null ? 'não verificado' : sub.waf || 'nenhum'}
            tone={sub?.waf ? 'ok' : sub?.waf === '' ? 'warn' : undefined}
          />
          <Info icon={<Server size={12} />} label="Portas" value={ports.length ? ports.map((p) => p.port).join(', ') : 'nenhuma'} />
        </motion.div>

        {sub?.title && (
          <motion.p {...stagger(2)} className="text-xs text-subtle italic">“{sub.title}”</motion.p>
        )}

        {ports.length > 0 && (
          <motion.div {...stagger(3)}>
            <Label>Serviços expostos</Label>
            <div className="flex flex-wrap gap-1.5">
              {ports.map((p) => (
                <span key={p.port} className="text-[11px] font-mono px-2 py-1 rounded bg-bg border border-border text-subtle">
                  <span className="text-foreground">{p.port}</span>/{p.protocol} {p.service !== '—' ? p.service : ''}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {sub && sub.tech.length > 0 && (
          <motion.div {...stagger(4)}>
            <Label>Tecnologias</Label>
            <div className="flex flex-wrap gap-1.5">
              {sub.tech.map((t) => (
                <span key={t} className="text-[11px] font-mono px-2 py-1 rounded bg-sky-400/10 border border-sky-400/25 text-sky-300 flex items-center gap-1">
                  <Cpu size={10} /> {t}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div {...stagger(5)}>
          <Label>Achados neste endereço ({mine.length})</Label>
          {mine.length === 0 ? (
            <p className="text-xs text-muted font-mono">Nenhum problema encontrado aqui.</p>
          ) : (
            <ul className="space-y-1.5">
              {mine.map((f, i) => (
                <motion.li key={f.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}>
                  <button
                    onClick={() => onOpenFinding(f.id)}
                    className="w-full text-left rounded-lg border border-border-2 bg-surface hover:bg-surface-3 hover:border-subtle/40 px-3 py-2.5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={f.severity} />
                      <StatusBadge status={f.status} />
                    </div>
                    <p className="text-xs text-foreground">{f.title}</p>
                    <p className="text-[10px] font-mono text-muted mt-0.5">{typeLabel[f.type]}</p>
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">{children}</p>;
}

function Info({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'ok' | 'warn' }) {
  const cls = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-med' : 'text-foreground';
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted font-mono tracking-wide uppercase mb-0.5 flex items-center gap-1">
        {icon} {label}
      </p>
      <p className={`text-xs font-mono break-all ${cls}`}>{value}</p>
    </div>
  );
}

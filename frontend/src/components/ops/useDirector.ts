import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScanStatus } from '../../lib/api';
import type { Finding, Subdomain } from '../../types';
import { SEV_RANK, isIssue } from '../../lib/score';
import { sfx } from '../../lib/sound';

export type Stage = 'graph' | 'globe';

interface Input {
  /** muda a cada análise aberta (ou ao entrar no replay): zera o que já foi visto */
  scanKey: string;
  domain: string;
  status: ScanStatus;
  subdomains: Subdomain[];
  findings: Finding[];
}

const TICK_MS = 1600;
const GLOBE_MS = 7000;
const SPOT_MS = 4000;

/**
 * Diretor automático da sala de operações, como numa transmissão de TV: a
 * câmera segue a ação. Endereço novo → o grafo aproxima dele; auditoria web →
 * o globo voa até o servidor; achado grave → holofote no achado; IA → enquadra
 * tudo. Se o usuário escolhe uma visão, ela fica fixa até ele soltar.
 */
export function useDirector({ scanKey, domain, status, subdomains, findings }: Input) {
  const [pinned, setPinned] = useState<Stage | null>(null);
  const [auto, setAuto] = useState<Stage>('graph');
  const [focus, setFocus] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const [spot, setSpot] = useState<Finding | null>(null);
  const queue = useRef<string[]>([]);
  const seenHosts = useRef<Set<string> | null>(null);
  const seenFindings = useRef<Set<string> | null>(null);

  useEffect(() => {
    seenHosts.current = null;
    seenFindings.current = null;
    queue.current = [];
    setPinned(null);
    setAuto('graph');
    setSpot(null);
  }, [scanKey]);

  // endereços novos entram na fila da câmera
  useEffect(() => {
    const hosts = subdomains.map((s) => s.host);
    if (seenHosts.current === null) {
      seenHosts.current = new Set(hosts);
      return;
    }
    for (const h of hosts) {
      if (seenHosts.current.has(h)) continue;
      seenHosts.current.add(h);
      queue.current.push(h === domain ? 'domain' : `host:${h}`);
    }
  }, [subdomains, domain]);

  // achados novos: câmera vai até eles; os graves ganham holofote e alarme
  useEffect(() => {
    const issues = findings.filter(isIssue);
    const key = (f: Finding) => `${f.id}:${f.status}:${f.severity}`;
    if (seenFindings.current === null) {
      seenFindings.current = new Set(issues.map(key));
      return;
    }
    let worst: Finding | null = null;
    for (const f of issues) {
      const k = key(f);
      if (seenFindings.current.has(k)) continue;
      const isNew = ![...seenFindings.current].some((s) => s.startsWith(`${f.id}:`));
      seenFindings.current.add(k);
      if (isNew) queue.current.push(`finding:${f.id}`);
      if (f.status === 'confirmed' && SEV_RANK[f.severity] >= 4 && (!worst || SEV_RANK[f.severity] > SEV_RANK[worst.severity])) {
        worst = f;
      }
    }
    if (worst) {
      setSpot(worst);
      sfx.alert();
    }
  }, [findings]);

  // a câmera muda no máximo a cada TICK_MS, sempre para o mais recente
  useEffect(() => {
    const t = setInterval(() => {
      const id = queue.current.pop();
      queue.current = [];
      if (id) setFocus((f) => ({ id, n: f.n + 1 }));
    }, TICK_MS);
    return () => clearInterval(t);
  }, []);

  // mudanças de etapa. O globo fica no palco por um tempo mínimo mesmo que a
  // etapa avance antes (replay acelerado), senão ele só pisca.
  const globeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (status === 'web_audit' && !globeTimer.current) {
      setAuto('globe');
      globeTimer.current = setTimeout(() => {
        globeTimer.current = undefined;
        setAuto('graph');
      }, GLOBE_MS);
    }
    if (status === 'triaging' || status === 'completed') setFocus((f) => ({ id: null, n: f.n + 1 }));
  }, [status]);
  useEffect(
    () => () => {
      clearTimeout(globeTimer.current);
      globeTimer.current = undefined;
    },
    [scanKey],
  );

  useEffect(() => {
    if (!spot) return;
    const t = setTimeout(() => setSpot(null), SPOT_MS);
    return () => clearTimeout(t);
  }, [spot]);

  const pin = useCallback((s: Stage) => setPinned(s), []);
  const release = useCallback(() => setPinned(null), []);
  const dismissSpot = useCallback(() => setSpot(null), []);

  return {
    stage: pinned ?? auto,
    automatic: pinned === null,
    /** quando fixado, a câmera do grafo para de seguir */
    graphFocus: pinned ? undefined : focus,
    globeFocusHost: auto === 'globe' && !pinned ? (subdomains.find((s) => s.status === 'active')?.host ?? domain) : null,
    spot,
    pin,
    release,
    dismissSpot,
  };
}

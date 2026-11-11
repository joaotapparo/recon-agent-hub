import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiDomain, ApiFinding, ApiScanEvent, ApiScanJob, ScanStatus } from '../lib/api';
import { parseApiDate, toDataset } from '../lib/adapters';
import type { ScanDataset } from '../types';

// Modo demonstração: reproduz um scan concluído a partir dos dados já salvos
// (eventos, subdomínios, achados). Nada é executado de novo: sem rede, sem
// ferramentas e sem IA, então a apresentação não depende do Gemini responder.

const TARGET_SECONDS = 55; // duração aproximada do replay em 1x
const MIN_GAP_MS = 140;
const MAX_GAP_MS = 2600;

const ORDER: ScanStatus[] = [
  'pending',
  'enumerating',
  'probing',
  'port_scanning',
  'checking_takeover',
  'web_audit',
  'scanning_js',
  'triaging',
  'completed',
];

const rank = (s: string) => {
  const i = ORDER.indexOf(s as ScanStatus);
  return i < 0 ? 0 : i;
};

/** Etapa em que cada tipo de achado aparece no pipeline. */
function findingStage(f: ApiFinding): ScanStatus {
  if (f.category === 'open_port') return 'port_scanning';
  if (f.category === 'subdomain_takeover') return 'checking_takeover';
  if (f.category === 'misconfiguration' && f.source_tool !== 'sensitive-files') return 'web_audit';
  if (f.category === 'vulnerable_component' || f.category === 'credential_leak') return 'web_audit';
  return 'scanning_js';
}

export interface ReplaySource {
  domain: ApiDomain;
  scan: ApiScanJob;
  findings: ApiFinding[];
  events: ApiScanEvent[];
}

export interface ReplayView {
  dataset: ScanDataset;
  events: ApiScanEvent[];
  status: ScanStatus;
}

function buildView(src: ReplaySource, played: number): ReplayView {
  const events = src.events.slice(0, played);
  const last = events[events.length - 1];
  const status: ScanStatus = played === 0 ? 'pending' : last.stage === 'failed' ? 'completed' : (last.stage as ScanStatus);
  const now = rank(status);
  const text = events.map((e) => e.message).join('\n');
  const passed = (s: ScanStatus) => now > rank(s);

  const subdomains = src.scan.subdomains
    .filter((s) => passed('enumerating') || text.includes(s.hostname))
    .map((s) => ({
      ...s,
      http_status: passed('probing') || (now >= rank('probing') && text.includes(`//${s.hostname}`)) ? s.http_status : null,
      open_ports: (s.open_ports ?? []).filter(
        (p) => passed('port_scanning') || text.includes(`Porta ${p.port}/${p.protocol ?? 'tcp'} aberta em ${s.hostname}`),
      ),
      takeover_candidate: passed('checking_takeover') && s.takeover_candidate,
      waf: passed('web_audit') ? s.waf : null,
    }));

  const aiDone = passed('triaging');
  const findings = src.findings
    .filter((f) => passed(findingStage(f)))
    .map((f) => {
      // RF09: arquivo sensível já nasce confirmado; o resto espera a IA
      if (aiDone || f.source_tool === 'sensitive-files') return f;
      return { ...f, ai_verdict: 'pending' as const, ai_severity: null, ai_reasoning: null, ai_reproduction_steps: null, ai_remediation: null };
    });

  const scan: ApiScanJob = { ...src.scan, status, subdomains, finished_at: status === 'completed' ? src.scan.finished_at : null };
  return { dataset: toDataset(src.domain, scan, findings), events, status };
}

function gaps(events: ApiScanEvent[], speed: number): number[] {
  if (events.length < 2) return events.map(() => MIN_GAP_MS);
  const times = events.map((e) => parseApiDate(e.created_at).getTime());
  const total = Math.max(1, (times[times.length - 1] - times[0]) / 1000);
  const scale = Math.min(1, TARGET_SECONDS / total);
  return times.map((t, i) => {
    const real = i === 0 ? 0 : t - times[i - 1];
    return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, real * scale)) / speed;
  });
}

export function useReplay(source: ReplaySource | null) {
  const [played, setPlayed] = useState<number | null>(null); // null = fora do replay
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const total = source?.events.length ?? 0;
  const delays = useMemo(() => (source ? gaps(source.events, speed) : []), [source, speed]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (played == null || paused || played >= total) return;
    timer.current = setTimeout(() => setPlayed((p) => (p == null ? p : p + 1)), delays[played] ?? MIN_GAP_MS);
    return () => clearTimeout(timer.current);
  }, [played, paused, total, delays]);

  // trocou de scan/domínio: sai do replay
  const sourceId = source?.scan.id;
  useEffect(() => setPlayed(null), [sourceId]);

  const start = useCallback(() => {
    setPaused(false);
    setPlayed(0);
  }, []);
  const stop = useCallback(() => setPlayed(null), []);
  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const view = useMemo(
    () => (source && played != null ? buildView(source, Math.min(played, total)) : null),
    [source, played, total],
  );

  return {
    active: played != null,
    finished: played != null && played >= total,
    paused,
    speed,
    setSpeed,
    progress: total ? Math.min(1, (played ?? 0) / total) : 0,
    available: total > 0,
    start,
    stop,
    togglePause,
    view,
  };
}

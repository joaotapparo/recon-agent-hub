import { lazy, Suspense, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Radio } from 'lucide-react';
import type { ApiScanEvent, ApiScanSummary, ScanStatus } from '../lib/api';
import type { ScanDataset } from '../types';
import { SEV_RANK, isIssue } from '../lib/score';
import { businessImpact } from '../lib/businessImpact';
import { SEV_COLOR } from '../lib/hosts';
import { SeverityBadge, typeLabel } from '../utils';
import TabNav, { TABS, type TabId } from './TabNav';
import RiskScore from './RiskScore';
import SummaryCards from './SummaryCards';
import TopChain from './TopChain';
import SecurityChecklist from './SecurityChecklist';
import SiteGallery from './SiteGallery';
import AttackGraph from './AttackGraph';
import AttackChains from './AttackChains';
import SecurityFindings from './SecurityFindings';
import Infrastructure from './Infrastructure';
import CodeFindings from './CodeFindings';
import ScanHistory from './ScanHistory';
import FinalReport from './FinalReport';
import LiveOperations from './LiveOperations';

const ServerGlobe = lazy(() => import('./ServerGlobe'));

interface Props {
  tab: TabId;
  onTab: (id: TabId) => void;
  /** o que está na tela (no replay concluído, a versão reproduzida) */
  shown: ScanDataset;
  /** a análise real, sem replay: relatório e histórico usam esta */
  real: ScanDataset;
  events: ApiScanEvent[];
  status: ScanStatus;
  shots: string[];
  history: ApiScanSummary[];
  readOnly: boolean;
  replayAvailable: boolean;
  onReplay: () => void;
  /** sair da demonstração (quando ela terminou e o resultado reproduzido está na tela) */
  onExitReplay: () => void;
  onViewScan: (id: number) => void;
  onReviewed: () => void;
  focusFinding: string | null;
  onFocusFinding: (id: string | null) => void;
  onOpenHost: (host: string) => void;
  presenting: boolean;
  onTogglePresent: () => void;
  tv: boolean;
  onToggleTv?: () => void;
}

/** Resultado da análise em abas: cada uma ocupa a tela inteira. */
export default function ResultsView(props: Props) {
  const { tab, onTab, shown, real } = props;
  const prevIdx = useRef(0);
  const idx = TABS.findIndex((t) => t.id === tab);
  const dir = idx >= prevIdx.current ? 1 : -1;
  prevIdx.current = idx;

  const openFinding = (id: string) => props.onFocusFinding(id);

  return (
    <>
      <TabNav
        active={tab}
        onSelect={onTab}
        badges={{ achados: shown.stats.findings }}
        presenting={props.presenting}
        onTogglePresent={props.onTogglePresent}
        tv={props.tv}
        onToggleTv={props.onToggleTv}
      />
      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={tab}
          custom={dir}
          initial={{ opacity: 0, x: 40 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 * dir }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {tab === 'resumo' && <Resumo {...props} openFinding={openFinding} />}

          {tab === 'mapa' && (
            <AttackGraph
              domain={shown.domain}
              subdomains={shown.subdomains}
              findings={shown.findings}
              openPorts={shown.openPorts}
              running={false}
              onOpenHost={props.onOpenHost}
              onOpenFinding={openFinding}
            />
          )}

          {tab === 'globo' && (
            <Suspense fallback={<Loading text="Carregando globo…" />}>
              <ServerGlobe scanId={shown.scanId} subdomains={shown.subdomains} findings={shown.findings} onOpenHost={props.onOpenHost} />
            </Suspense>
          )}

          {tab === 'cadeias' && (
            <AttackChains
              scanId={shown.scanId}
              completed={real.status === 'completed' && !props.readOnly}
              findings={shown.findings}
              readOnly={props.readOnly}
              onOpenFinding={openFinding}
            />
          )}

          {tab === 'achados' && (
            <SecurityFindings
              findingsList={shown.findings}
              readOnly={props.readOnly}
              onReviewed={props.onReviewed}
              selectedId={props.focusFinding}
              onSelect={props.onFocusFinding}
            />
          )}

          {tab === 'infra' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Infrastructure subdomainsList={shown.subdomains} openPortsList={shown.openPorts} takeoverRisksList={shown.takeoverRisks} />
              <CodeFindings endpointsList={shown.endpoints} secretsList={shown.secrets} sensitiveFilesList={shown.sensitiveFiles} />
            </div>
          )}

          {tab === 'relatorio' && (
            <>
              <FinalReport dataset={real} />
              {props.history.length > 1 && (
                <ScanHistory history={props.history} currentScanId={real.scanId} currentFindings={real.findings} onSelect={props.onViewScan} />
              )}
              <LiveOperations scanId={shown.scanId} status={props.status} events={props.events} />
            </>
          )}
        </motion.div>
      </AnimatePresence>

    </>
  );
}

function Resumo(props: Props & { openFinding: (id: string) => void }) {
  const { shown } = props;
  const top = useMemo(
    () =>
      shown.findings
        .filter(isIssue)
        .sort((a, b) => Number(b.status === 'confirmed') - Number(a.status === 'confirmed') || SEV_RANK[b.severity] - SEV_RANK[a.severity])
        .slice(0, 3),
    [shown.findings],
  );

  return (
    <>
      {props.readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/40 bg-ok/5 px-5 py-3">
          <span className="flex items-center gap-2 text-xs font-mono text-ok">
            <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" /> Demonstração concluída: este é o resultado reproduzido.
          </span>
          <span className="flex gap-2">
            <button onClick={props.onReplay} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-ok/40 text-ok hover:bg-ok/10 cursor-pointer">
              ↺ Repetir
            </button>
            <button onClick={props.onExitReplay} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-border-2 text-subtle hover:text-foreground cursor-pointer">
              Sair da demonstração
            </button>
          </span>
        </div>
      )}
      {props.replayAvailable && !props.readOnly && (
        <motion.button
          onClick={props.onReplay}
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.99 }}
          className="group relative w-full overflow-hidden flex items-center justify-between gap-3 rounded-xl border border-ok/30 bg-gradient-to-r from-ok/10 via-surface to-surface px-5 py-3.5 text-left cursor-pointer"
        >
          <span className="flex items-center gap-3">
            <span className="relative flex w-9 h-9 items-center justify-center rounded-full bg-ok/15 text-ok">
              <span className="absolute inset-0 rounded-full border border-ok/50 animate-ping" />
              <Radio size={16} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">Reproduzir na sala de operações</span>
              <span className="block text-[11px] text-muted">
                Assista à análise do zero em cerca de 1 minuto, com radar, grafo, globo e IA, sem rodar nada de novo.
              </span>
            </span>
          </span>
          <ArrowRight size={18} className="text-ok group-hover:translate-x-1 transition-transform" />
        </motion.button>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] gap-4">
        <RiskScore findings={shown.findings} running={false} onOpenFinding={props.openFinding} />
        <div className="flex flex-col gap-4 min-w-0">
          <SummaryCards stats={shown.stats} />
          <TopChain scanId={shown.scanId} findings={shown.findings} onOpen={() => props.onTab('cadeias')} />
          <section className="bg-surface border border-border rounded-xl p-5 flex-1">
            <h2 className="font-display font-600 text-base text-foreground tracking-wide mb-3">O que corrigir primeiro</h2>
            {top.length === 0 ? (
              <p className="text-xs font-mono text-muted py-4 text-center">Nada relevante encontrado.</p>
            ) : (
              <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {top.map((f, i) => (
                  <motion.li
                    key={f.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.1 }}
                  >
                    <button
                      onClick={() => props.openFinding(f.id)}
                      className="w-full h-full text-left rounded-lg border bg-surface-2 hover:bg-surface-3 p-3.5 cursor-pointer transition-colors"
                      style={{ borderColor: `${SEV_COLOR[f.severity]}40` }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-display font-bold text-2xl" style={{ color: SEV_COLOR[f.severity] }}>
                          {i + 1}
                        </span>
                        <SeverityBadge severity={f.severity} />
                      </div>
                      <p className="text-xs text-foreground font-medium leading-snug">{f.title}</p>
                      <p className="text-[10px] font-mono text-muted mt-1">{typeLabel[f.type]}</p>
                      <p className="text-[11px] text-subtle mt-2 leading-relaxed line-clamp-3">{businessImpact(f).fix}</p>
                    </button>
                  </motion.li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <SecurityChecklist stages={shown.stages} findings={shown.findings} events={props.events} subdomains={shown.subdomains} />
      {props.shots.length > 0 && (
        <SiteGallery scanId={shown.scanId} hosts={props.shots} subdomains={shown.subdomains} findings={shown.findings} />
      )}
    </>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl min-h-[480px] flex items-center justify-center text-xs font-mono text-muted animate-pulse">
      {text}
    </div>
  );
}

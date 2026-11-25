import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import NewScanModal from './components/NewScanModal';
import HostDrawer from './components/HostDrawer';
import DomainVerification from './components/DomainVerification';
import { FindingDrawer } from './components/SecurityFindings';
import ResultsView from './components/ResultsView';
import OpsRoom from './components/ops/OpsRoom';
import GradeReveal from './components/GradeReveal';
import { usePresentation, type TabId } from './components/TabNav';
import { useScanEvents } from './hooks/useScanEvents';
import { useReplay, type ReplaySource } from './hooks/useReplay';
import { gradeOf, scoreOf } from './lib/score';
import {
  api,
  isRunning,
  type ApiDomain,
  type ApiFinding,
  type ApiScanJob,
  type ApiScanSummary,
  type ScanStatus,
} from './lib/api';
import { toDataset, toHistoryItem } from './lib/adapters';
import type { ScanDataset } from './types';

const POLL_RUNNING_MS = 3000;
const POLL_IDLE_MS = 15000;

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [domains, setDomains] = useState<ApiDomain[] | null>(null);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dataset, setDataset] = useState<ScanDataset | null>(null);
  // respostas cruas do scan aberto, usadas pelo modo demonstração
  const [raw, setRaw] = useState<{ scan: ApiScanJob; findings: ApiFinding[] } | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [isNewScanOpen, setIsNewScanOpen] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  // incrementado depois de uma revisão humana, pra recarregar o scan aberto
  const [reloadTick, setReloadTick] = useState(0);
  // painéis laterais: endereço (grafo/globo) e achado (lista, cadeias, nota, alertas)
  const [openHost, setOpenHost] = useState<string | null>(null);
  const [focusFinding, setFocusFinding] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenHost(null);
      setFocusFinding(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openFinding = useCallback((id: string) => {
    setOpenHost(null);
    setFocusFinding(id);
  }, []);

  const loadDomains = useCallback(async () => {
    try {
      const list = await api.listDomains();
      setDomains(list);
      setDomainsError(null);
      // seleciona o mais recente na primeira carga
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (e) {
      setDomainsError((e as Error).message);
    }
  }, []);

  // Lista de domínios (RF16): poll mais rápido enquanto algum scan roda.
  const anyRunning = domains?.some((d) => isRunning(d.latest_scan_status)) ?? false;
  useEffect(() => {
    loadDomains();
    const timer = setInterval(loadDomains, anyRunning ? POLL_RUNNING_MS : POLL_IDLE_MS);
    return () => clearInterval(timer);
  }, [loadDomains, anyRunning]);

  const selected = domains?.find((d) => d.id === selectedId) ?? null;
  const latestScanId = selected?.latest_scan_id ?? null;
  const latestStatus = selected?.latest_scan_status ?? null;

  // Histórico do domínio (antes/depois). Recarrega quando o último scan muda de status.
  const [history, setHistory] = useState<ApiScanSummary[]>([]);
  useEffect(() => {
    if (selectedId == null || latestScanId == null) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    api
      .listDomainScans(selectedId)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [selectedId, latestScanId, latestStatus]);

  // Análise aberta: a mais recente, a menos que o usuário escolha outra no histórico.
  const [viewScanId, setViewScanId] = useState<number | null>(null);
  useEffect(() => setViewScanId(null), [selectedId, latestScanId]);
  const scanId = viewScanId ?? latestScanId;
  const scanStatus: ScanStatus | null =
    viewScanId == null ? latestStatus : (history.find((h) => h.id === viewScanId)?.status ?? null);

  // Detalhe do scan selecionado (RF14/RF15). Recarrega quando o status muda
  // na lista e, enquanto roda, a cada POLL_RUNNING_MS.
  useEffect(() => {
    if (!selected || scanId == null) {
      setDataset(null);
      return;
    }
    let cancelled = false;
    const domain = selected;

    const load = async () => {
      try {
        const [scan, findings, screenshots] = await Promise.all([
          api.getScan(scanId),
          api.getFindings(scanId),
          api.listScreenshots(scanId).catch(() => [] as string[]),
        ]);
        if (cancelled) return;
        setDataset(toDataset(domain, scan, findings));
        setRaw({ scan, findings });
        setShots(screenshots);
        setDatasetError(null);
      } catch (e) {
        if (!cancelled) setDatasetError((e as Error).message);
      }
    };

    load();
    const timer = isRunning(scanStatus) ? setInterval(load, POLL_RUNNING_MS) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // selected muda de referência a cada poll da lista; dependemos só do que importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, scanStatus, reloadTick]);

  const handleSelect = (id: number) => {
    if (id === selectedId) return;
    setDataset(null);
    setDatasetError(null);
    setSelectedId(id);
  };

  const handleViewScan = (id: number) => {
    if (id === scanId) return;
    setDataset(null);
    setViewScanId(id === latestScanId ? null : id);
  };

  const handleStartScan = async (domain: string, authorized: boolean) => {
    const res = await api.submitDomain(domain, authorized); // erros sobem para o modal
    setDataset(null);
    setSelectedId(res.domain_id);
    await loadDomains();
    return res;
  };

  const handleVerify = async (domainId: number) => {
    await api.verifyDomain(domainId); // erro sobe para o painel de verificação
    setDataset(null);
    setSelectedId(domainId);
    await loadDomains();
  };

  const handleRescan = async () => {
    if (!selected) return;
    setRescanning(true);
    try {
      await api.rescan(selected.id);
      await loadDomains();
    } catch (e) {
      setDatasetError((e as Error).message);
    } finally {
      setRescanning(false);
    }
  };

  const historyList = (domains ?? []).map(toHistoryItem);
  const showDataset = dataset && dataset.domainId === selectedId && dataset.scanId === scanId ? dataset : null;

  const events = useScanEvents(scanId, isRunning(scanStatus));

  // Modo demonstração: só para análises concluídas, com o feed já carregado.
  const replaySource = useMemo<ReplaySource | null>(
    () =>
      selected && showDataset?.status === 'completed' && raw && raw.scan.id === showDataset.scanId && events.length
        ? { domain: selected, scan: raw.scan, findings: raw.findings, events }
        : null,
    // selected muda de referência a cada poll; o conteúdo relevante está em raw/events
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, events, showDataset?.status, showDataset?.scanId],
  );
  const replay = useReplay(replaySource);
  const shown = replay.view?.dataset ?? showDataset;
  const shownEvents = replay.view?.events ?? events;
  const shownStatus = (replay.view?.status ?? showDataset?.rawStatus) as ScanStatus;
  // no replay, os prints só aparecem depois da etapa em que foram tirados
  const replayOrder: ScanStatus[] = ['scanning_js', 'triaging', 'completed'];
  const shownShots = !replay.active || replayOrder.includes(shownStatus) ? shots : [];
  const screenshotOf = (h: string) => (shown && shownShots.includes(h) ? api.screenshotUrl(shown.scanId, h) : undefined);

  const [tab, setTab] = useState<TabId>('resumo');
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const presentation = usePresentation(tab, setTab, closeSidebar);

  // sala de operações enquanto a análise roda (ao vivo ou demonstração)
  const isOps = Boolean(showDataset && shown && shown.status === 'running');

  // entrar na sala recolhe a barra lateral; sair devolve como estava
  const sidebarBefore = useRef<boolean | null>(null);
  useEffect(() => {
    if (isOps && sidebarBefore.current === null) {
      sidebarBefore.current = sidebarOpen;
      setSidebarOpen(false);
    } else if (!isOps && sidebarBefore.current !== null) {
      setSidebarOpen(sidebarBefore.current && !presentation.presenting);
      sidebarBefore.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOps]);

  // fim da análise (ao vivo ou demonstração até o fim): revela a nota.
  // Sair da demonstração no meio não conta.
  const [reveal, setReveal] = useState(false);
  const prevOps = useRef<{ scanId: number; ops: boolean; replay: boolean } | null>(null);
  useEffect(() => {
    if (!shown) return;
    const prev = prevOps.current;
    if (prev && prev.scanId === shown.scanId && prev.ops && !isOps && prev.replay === replay.active && shown.status === 'completed') {
      setReveal(true);
      setTab('resumo');
    }
    prevOps.current = { scanId: shown.scanId, ops: isOps, replay: replay.active };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOps, shown?.scanId, shown?.status, replay.active]);
  const endReveal = useCallback(() => setReveal(false), []);

  // modo TV: repete a demonstração em loop, passeando pelas abas no fim
  const [tv, setTv] = useState(false);
  const toggleTv = () => {
    if (tv) {
      setTv(false);
      replay.stop();
      return;
    }
    setTv(true);
    if (!presentation.presenting) presentation.toggle();
    replay.start();
  };
  useEffect(() => {
    if (!presentation.presenting) setTv(false);
  }, [presentation.presenting]);
  useEffect(() => {
    if (!tv || !replay.finished || reveal) return;
    const steps: [TabId, number][] = [
      ['resumo', 0],
      ['mapa', 9000],
      ['globo', 18000],
      ['cadeias', 27000],
    ];
    const timers = steps.map(([t, ms]) => setTimeout(() => setTab(t), ms));
    timers.push(setTimeout(() => replay.start(), 36000));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tv, replay.finished, reveal]);

  // trocar de domínio/análise volta para o resumo
  useEffect(() => setTab('resumo'), [selectedId, viewScanId]);

  return (
    <div className="flex h-screen w-full bg-bg text-foreground overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        activeId={selectedId}
        onSelect={handleSelect}
        onNewScan={() => setIsNewScanOpen(true)}
        historyList={historyList}
      />

      <div
        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-300"
        style={{ marginLeft: sidebarOpen ? '16rem' : '0' }}
      >
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onNewScan={() => setIsNewScanOpen(true)}
          onRescan={selected && !isRunning(scanStatus) ? handleRescan : undefined}
          rescanning={rescanning}
          domain={showDataset?.domain ?? selected?.name}
          date={showDataset?.date}
          status={shown?.status}
        />

        <main className={`flex-1 relative bg-grid ${isOps ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto'}`}>
          {isOps && shown ? (
            <OpsRoom
              dataset={shown}
              events={shownEvents}
              status={shownStatus}
              replay={{
                active: replay.active,
                finished: replay.finished,
                paused: replay.paused,
                speed: replay.speed,
                progress: replay.progress,
                onTogglePause: replay.togglePause,
                onSpeed: replay.setSpeed,
                onStop: replay.stop,
              }}
              presenting={presentation.presenting}
              onTogglePresent={presentation.toggle}
              onOpenHost={setOpenHost}
              onOpenFinding={openFinding}
            />
          ) : (
            <div className="max-w-screen-2xl mx-auto px-5 pb-10 pt-5 space-y-4">
              {domainsError && <Banner tone="error">{domainsError}</Banner>}
              {datasetError && <Banner tone="error">{datasetError}</Banner>}
              {showDataset?.errorMessage && (
                <Banner tone="error">
                  <span className="font-semibold">O scan falhou:</span> {showDataset.errorMessage}
                </Banner>
              )}

              {domains === null && !domainsError && <Placeholder>Carregando…</Placeholder>}

              {domains?.length === 0 && (
                <Placeholder>
                  <p className="mb-4">Nenhum domínio analisado ainda.</p>
                  <button
                    onClick={() => setIsNewScanOpen(true)}
                    className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 font-mono text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-white"
                  >
                    Iniciar primeira análise
                  </button>
                </Placeholder>
              )}

              {selected && scanId == null && selected.verification && (
                <div className="bg-surface border border-border rounded-lg p-6 max-w-2xl mx-auto w-full">
                  <DomainVerification domain={selected.name} challenge={selected.verification} onVerify={() => handleVerify(selected.id)} />
                </div>
              )}
              {selected && scanId == null && !selected.verification && <Placeholder>Nenhuma análise para este domínio ainda.</Placeholder>}
              {selected && scanId != null && !showDataset && !datasetError && <Placeholder>Carregando análise…</Placeholder>}

              {showDataset && shown && (
                <>
                  {viewScanId != null && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-med/30 bg-med/10 px-4 py-2.5 text-xs font-mono text-med">
                      <span>Você está vendo uma análise anterior ({showDataset.date}).</span>
                      <button onClick={() => handleViewScan(latestScanId!)} className="underline cursor-pointer hover:text-foreground">
                        Voltar para a mais recente
                      </button>
                    </div>
                  )}
                  <ResultsView
                    tab={tab}
                    onTab={setTab}
                    shown={shown}
                    real={showDataset}
                    events={shownEvents}
                    status={shownStatus}
                    shots={shownShots}
                    history={history}
                    readOnly={replay.active}
                    replayAvailable={showDataset.status === 'completed' && replay.available}
                    onReplay={replay.start}
                    onExitReplay={replay.stop}
                    onViewScan={handleViewScan}
                    onReviewed={() => setReloadTick((t) => t + 1)}
                    focusFinding={focusFinding}
                    onFocusFinding={setFocusFinding}
                    onOpenHost={setOpenHost}
                    presenting={presentation.presenting}
                    onTogglePresent={presentation.toggle}
                    tv={tv}
                    onToggleTv={replay.available && showDataset.status === 'completed' ? toggleTv : undefined}
                  />
                </>
              )}
            </div>
          )}

          {shown && (
            <>
              <HostDrawer
                host={openHost}
                subdomains={shown.subdomains}
                findings={shown.findings}
                openPorts={shown.openPorts}
                screenshotOf={screenshotOf}
                onClose={() => setOpenHost(null)}
                onOpenFinding={openFinding}
              />
              <FindingDrawer
                findings={shown.findings}
                selectedId={focusFinding}
                onClose={() => setFocusFinding(null)}
                readOnly={replay.active}
                onReviewed={() => setReloadTick((t) => t + 1)}
              />
            </>
          )}
        </main>
      </div>

      <AnimatePresence>
        {reveal && shown && (
          <GradeReveal
            domain={shown.domain}
            score={scoreOf(shown.findings)}
            grade={gradeOf(shown.findings)}
            findings={shown.stats.findings}
            onDone={endReveal}
          />
        )}
      </AnimatePresence>

      <NewScanModal
        isOpen={isNewScanOpen}
        onClose={() => setIsNewScanOpen(false)}
        onStartScan={handleStartScan}
        onVerify={handleVerify}
      />
      {presentation.hud}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'error'; children: React.ReactNode }) {
  const cls = tone === 'error' ? 'text-crit bg-crit/10 border-crit/25' : '';
  return <div className={`rounded-lg border px-4 py-3 text-xs font-mono ${cls}`}>{children}</div>;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-6 py-16 text-center text-sm text-muted font-mono">
      {children}
    </div>
  );
}

import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SummaryCards from './components/SummaryCards';
import AnalysisProgress from './components/AnalysisProgress';
import SecurityFindings from './components/SecurityFindings';
import Infrastructure from './components/Infrastructure';
import CodeFindings from './components/CodeFindings';
import FinalReport from './components/FinalReport';
import NewScanModal, { type ScanOptions } from './components/NewScanModal';
import {
  history as initialHistory,
  analysisStages as initialStages,
  currentDomain as initialDomain,
  scanDatasets,
  type ScanDataset,
} from './mockData';
import type { HistoryItem, AnalysisStage, AnalysisStatus } from './types';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyList, setHistoryList] = useState<HistoryItem[]>(initialHistory);
  const [activeHistoryId, setActiveHistoryId] = useState('h1');
  const [currentDomain, setCurrentDomain] = useState(initialDomain);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('completed');
  const [analysisDate, setAnalysisDate] = useState('03/09/2026 às 14:32');
  const [stages, setStages] = useState<AnalysisStage[]>(initialStages);
  const [activeDataset, setActiveDataset] = useState<ScanDataset>(scanDatasets.h1);
  const [isNewScanOpen, setIsNewScanOpen] = useState(false);

  const handleSelectHistory = (id: string) => {
    setActiveHistoryId(id);
    const selectedHistory = historyList.find((h) => h.id === id);
    const dataset = scanDatasets[id];

    if (dataset) {
      setActiveDataset(dataset);
      setCurrentDomain(dataset.domain);
      setAnalysisDate(dataset.date);
      setAnalysisStatus(dataset.status);
      setStages(dataset.stages);
    } else if (selectedHistory) {
      setCurrentDomain(selectedHistory.domain);
      setAnalysisDate(`${selectedHistory.date} às 10:00`);
      setAnalysisStatus(selectedHistory.status);
    }
  };

  const handleStartScan = (domain: string, _options: ScanOptions) => {
    const newId = 'scan_' + Date.now();
    const today = new Date().toLocaleDateString('pt-BR');

    const newHistoryItem: HistoryItem = {
      id: newId,
      domain: domain,
      date: today,
      status: 'running',
    };

    const freshStages: AnalysisStage[] = [
      { name: 'Reconhecimento', status: 'running', progress: 20 },
      { name: 'Infraestrutura', status: 'pending', progress: 0 },
      { name: 'JavaScript', status: 'pending', progress: 0 },
      { name: 'Validação com IA', status: 'pending', progress: 0 },
      { name: 'Relatório', status: 'pending', progress: 0 },
    ];

    const freshDataset: ScanDataset = {
      domain,
      date: `${today} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      status: 'running',
      stats: {
        subdomains: 12,
        activeHosts: 8,
        openPorts: 4,
        findings: 3,
        critical: 1,
        high: 1,
        medium: 1,
        low: 0,
      },
      stages: freshStages,
      findings: [
        {
          id: 'nf1',
          severity: 'critical',
          type: 'secret',
          title: `Chave de API em ${domain}`,
          target: `api.${domain}`,
          file: '/static/bundle.js',
          status: 'confirmed',
          date: today,
          aiValidation: 'Validação com IA em andamento.',
          description: 'Identificada potencial chave de autenticação durante o reconhecimento.',
        },
      ],
      subdomains: [
        { host: `api.${domain}`, status: 'active', ip: '172.16.0.4', ports: [80, 443] },
        { host: `admin.${domain}`, status: 'active', ip: '172.16.0.5', ports: [443] },
      ],
      openPorts: [
        { host: domain, port: 443, protocol: 'TCP', service: 'HTTPS' },
        { host: domain, port: 80, protocol: 'TCP', service: 'HTTP' },
      ],
      takeoverRisks: [],
      endpoints: [
        { method: 'GET', path: '/api/v1/auth', host: `api.${domain}`, file: 'auth.js', aiRelevant: true },
      ],
      secrets: [
        { type: 'API Key', file: 'bundle.js', maskedValue: 'live_••••••••••••', aiResult: 'real' },
      ],
      sensitiveFiles: [
        { filename: '.env.backup', host: domain, accessible: false, severity: 'high' },
      ],
    };

    scanDatasets[newId] = freshDataset;
    setHistoryList((prev) => [newHistoryItem, ...prev]);
    setActiveHistoryId(newId);
    setCurrentDomain(domain);
    setAnalysisDate(freshDataset.date);
    setAnalysisStatus('running');
    setStages(freshStages);
    setActiveDataset(freshDataset);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      setStages((prev) => {
        const next = [...prev];
        if (step === 1) {
          next[0] = { name: 'Reconhecimento', status: 'completed', progress: 100 };
          next[1] = { name: 'Infraestrutura', status: 'running', progress: 50 };
        } else if (step === 2) {
          next[1] = { name: 'Infraestrutura', status: 'completed', progress: 100 };
          next[2] = { name: 'JavaScript', status: 'running', progress: 65 };
        } else if (step === 3) {
          next[2] = { name: 'JavaScript', status: 'completed', progress: 100 };
          next[3] = { name: 'Validação com IA', status: 'running', progress: 75 };
        } else if (step === 4) {
          next[3] = { name: 'Validação com IA', status: 'completed', progress: 100 };
          next[4] = { name: 'Relatório', status: 'running', progress: 90 };
        } else if (step >= 5) {
          next[4] = { name: 'Relatório', status: 'completed', progress: 100 };
          clearInterval(interval);
          setAnalysisStatus('completed');
          freshDataset.status = 'completed';
          setHistoryList((hList) =>
            hList.map((h) => (h.id === newId ? { ...h, status: 'completed', findingsCount: 3 } : h))
          );
        }
        return next;
      });
    }, 1200);
  };

  return (
    <div className="flex h-screen w-full bg-bg text-foreground overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        activeId={activeHistoryId}
        onSelect={handleSelectHistory}
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
          domain={currentDomain}
          date={analysisDate}
          status={analysisStatus}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-xl mx-auto px-5 py-5 space-y-4">
            <SummaryCards stats={activeDataset.stats} />
            <AnalysisProgress stages={stages} />
            <SecurityFindings findingsList={activeDataset.findings} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Infrastructure
                subdomainsList={activeDataset.subdomains}
                openPortsList={activeDataset.openPorts}
                takeoverRisksList={activeDataset.takeoverRisks}
              />
              <CodeFindings
                endpointsList={activeDataset.endpoints}
                secretsList={activeDataset.secrets}
                sensitiveFilesList={activeDataset.sensitiveFiles}
              />
            </div>
            <FinalReport
                scanId={activeHistoryId}
                domain={currentDomain}
                date={analysisDate}
                findingsList={activeDataset.findings}
                dataset={activeDataset}
              />
          </div>
        </main>
      </div>

      <NewScanModal
        isOpen={isNewScanOpen}
        onClose={() => setIsNewScanOpen(false)}
        onStartScan={handleStartScan}
      />
    </div>
  );
}

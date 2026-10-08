import { useState, useCallback } from 'react';
import { findings as defaultFindings, type ScanDataset } from '../mockData';
import type { Finding } from '../types';
import ReportModal from './ReportModal';
import {
  getReportData,
  downloadMarkdown,
  type ReportData,
} from '../services/reportService';

interface FinalReportProps {
  scanId?: string;
  domain?: string;
  date?: string;
  findingsList?: Finding[];
  dataset?: ScanDataset;
}

export default function FinalReport({
  scanId = 'h1',
  domain = 'empresa.com.br',
  date = '',
  findingsList = defaultFindings,
  dataset,
}: FinalReportProps) {
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingMd, setLoadingMd] = useState(false);

  const total = findingsList.length;
  const confirmed = findingsList.filter((f) => f.status === 'confirmed').length;
  const fp = findingsList.filter((f) => f.status === 'false_positive').length;
  const analyzing = findingsList.filter((f) => f.status === 'analyzing').length;

  // Build a ScanDataset-like object from props if dataset is not provided
  const resolvedDataset: ScanDataset = dataset ?? {
    domain,
    date,
    status: 'completed',
    stats: {
      subdomains: 0,
      activeHosts: 0,
      openPorts: 0,
      findings: total,
      critical: findingsList.filter((f) => f.severity === 'critical').length,
      high: findingsList.filter((f) => f.severity === 'high').length,
      medium: findingsList.filter((f) => f.severity === 'medium').length,
      low: findingsList.filter((f) => f.severity === 'low').length,
    },
    stages: [],
    findings: findingsList,
    subdomains: [],
    openPorts: [],
    takeoverRisks: [],
    endpoints: [],
    secrets: [],
    sensitiveFiles: [],
  };

  // ── Visualizar Relatório ────────────────────────────────────────────────
  const handleViewReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const data = await getReportData(scanId, resolvedDataset);
      setReportData(data);
      setIsReportOpen(true);
    } finally {
      setLoadingReport(false);
    }
  }, [scanId, resolvedDataset]);

  // ── Baixar Markdown ─────────────────────────────────────────────────────
  const handleDownloadMarkdown = useCallback(async () => {
    setLoadingMd(true);
    try {
      await downloadMarkdown(scanId, resolvedDataset);
    } finally {
      setLoadingMd(false);
    }
  }, [scanId, resolvedDataset]);

  // ── Baixar PDF (via print dialog sobre o modal) ─────────────────────────
  const handleDownloadPdf = useCallback(async () => {
    // Garante que o modal está aberto com os dados antes de imprimir
    setLoadingReport(true);
    try {
      const data = await getReportData(scanId, resolvedDataset);
      setReportData(data);
      setIsReportOpen(true);
      // Aguarda o React renderizar o modal, depois abre o print dialog
      setTimeout(() => window.print(), 300);
    } finally {
      setLoadingReport(false);
    }
  }, [scanId, resolvedDataset]);

  return (
    <>
      <section className="bg-surface border border-border rounded-lg px-6 py-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">Relatório final</p>
            <h2 className="font-display font-700 text-2xl text-foreground tracking-wide mb-4">Análise concluída</h2>

            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-3xl font-display font-700 text-foreground leading-none">{total}</p>
                <p className="text-xs text-muted mt-1">achados total</p>
              </div>
              <div>
                <p className="text-3xl font-display font-700 text-ok leading-none">{confirmed}</p>
                <p className="text-xs text-muted mt-1">confirmados</p>
              </div>
              <div>
                <p className="text-3xl font-display font-700 text-muted leading-none">{fp}</p>
                <p className="text-xs text-muted mt-1">falsos positivos</p>
              </div>
              {analyzing > 0 && (
                <div>
                  <p className="text-3xl font-display font-700 text-accent leading-none">{analyzing}</p>
                  <p className="text-xs text-muted mt-1">em análise</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Botões ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5 min-w-[210px]">
            {/* Visualizar Relatório */}
            <button
              onClick={handleViewReport}
              disabled={loadingReport}
              className="group w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-gradient-to-b from-zinc-100 to-zinc-200 hover:from-white hover:to-zinc-100 text-zinc-950 font-mono text-xs font-semibold tracking-wider uppercase border border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.08)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingReport ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/>
                  <path d="M21 12a9 9 0 00-9-9"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
              <span>{loadingReport ? 'Carregando...' : 'Visualizar Relatório'}</span>
            </button>

            {/* Baixar PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={loadingReport}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg border border-zinc-800 hover:border-zinc-600 bg-zinc-900/60 hover:bg-zinc-800/70 text-zinc-300 hover:text-white font-mono text-xs tracking-wider uppercase font-medium transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
              </svg>
              <span>Baixar PDF</span>
            </button>

            {/* Baixar Markdown */}
            <button
              onClick={handleDownloadMarkdown}
              disabled={loadingMd}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg border border-zinc-800 hover:border-zinc-600 bg-zinc-900/60 hover:bg-zinc-800/70 text-zinc-300 hover:text-white font-mono text-xs tracking-wider uppercase font-medium transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMd ? (
                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/>
                  <path d="M21 12a9 9 0 00-9-9"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              )}
              <span>{loadingMd ? 'Gerando...' : 'Baixar Markdown'}</span>
            </button>
          </div>
        </div>

        {/* Severity bar — usa findingsList (reactivo) em vez do array estático */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Distribuição por severidade</p>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex">
            {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
              const count = findingsList.filter((f) => f.severity === sev).length;
              const pct = total > 0 ? (count / total) * 100 : 0;
              const color = { critical: 'bg-crit', high: 'bg-high', medium: 'bg-med', low: 'bg-low' }[sev];
              return pct > 0 ? <div key={sev} className={`${color} h-full`} style={{ width: `${pct}%` }} /> : null;
            })}
          </div>
          <div className="flex gap-4 mt-2">
            {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
              const count = findingsList.filter((f) => f.severity === sev).length;
              const label = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' }[sev];
              const cls = { critical: 'text-crit', high: 'text-high', medium: 'text-med', low: 'text-low' }[sev];
              const dot = { critical: 'bg-crit', high: 'bg-high', medium: 'bg-med', low: 'bg-low' }[sev];
              return (
                <span key={sev} className={`text-[10px] font-mono ${cls} flex items-center gap-1`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {label} ({count})
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Modal do relatório */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        data={reportData}
      />
    </>
  );
}

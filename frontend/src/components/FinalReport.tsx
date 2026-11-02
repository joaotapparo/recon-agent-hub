import { useState } from 'react';
import type { ScanDataset } from '../types';
import ReportModal from './ReportModal';
import { api, type ApiReport } from '../lib/api';
import { downloadMarkdown, downloadPdf } from '../services/reportService';

interface FinalReportProps {
  dataset: ScanDataset;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const SEV_LABEL = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' };
const SEV_TEXT = { critical: 'text-crit', high: 'text-high', medium: 'text-med', low: 'text-low' };
const SEV_BG = { critical: 'bg-crit', high: 'bg-high', medium: 'bg-med', low: 'bg-low' };

const TITLE = {
  completed: 'Análise concluída',
  running: 'Análise em andamento',
  error: 'Análise com erro',
};

const spinner = (
  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/>
    <path d="M21 12a9 9 0 00-9-9"/>
  </svg>
);

const secondaryButton =
  'w-full flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg border border-zinc-800 hover:border-zinc-600 bg-zinc-900/60 hover:bg-zinc-800/70 text-zinc-300 hover:text-white font-mono text-xs tracking-wider uppercase font-medium transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

export default function FinalReport({ dataset }: FinalReportProps) {
  const [report, setReport] = useState<ApiReport | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<'view' | 'pdf' | 'md' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { findings, scanId, domain, status, stats } = dataset;
  const total = findings.length;
  const confirmed = findings.filter((f) => f.status === 'confirmed').length;
  const fp = findings.filter((f) => f.status === 'false_positive').length;
  const review = findings.filter((f) => f.status === 'needs_review').length;
  const analyzing = findings.filter((f) => f.status === 'analyzing').length;
  const ready = status === 'completed';

  const run = async (kind: 'view' | 'pdf' | 'md', action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleView = () =>
    run('view', async () => {
      const data = report?.scan_job_id === scanId ? report : await api.getReport(scanId);
      setReport(data);
      setIsOpen(true);
    });
  const handlePdf = () => run('pdf', () => downloadPdf(scanId, domain));
  const handleMd = () => run('md', () => downloadMarkdown(scanId, domain));

  const severityTotal = SEVERITIES.reduce((s, sev) => s + stats[sev], 0);

  return (
    <>
      <section className="bg-surface border border-border rounded-lg px-6 py-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">Relatório final</p>
            <h2 className="font-display font-700 text-2xl text-foreground tracking-wide mb-4">{TITLE[status]}</h2>

            <div className="flex flex-wrap gap-6">
              <Metric value={total} label="achados total" />
              <Metric value={confirmed} label="confirmados" cls="text-ok" />
              <Metric value={fp} label="falsos positivos" cls="text-muted" />
              {review > 0 && <Metric value={review} label="revisão manual" cls="text-med" />}
              {analyzing > 0 && <Metric value={analyzing} label="aguardando IA" cls="text-accent" />}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 min-w-[210px]">
            <button
              onClick={handleView}
              disabled={!ready || busy !== null}
              className="group w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-gradient-to-b from-zinc-100 to-zinc-200 hover:from-white hover:to-zinc-100 text-zinc-950 font-mono text-xs font-semibold tracking-wider uppercase border border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.08)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'view' ? spinner : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
              <span>{busy === 'view' ? 'Carregando...' : 'Visualizar Relatório'}</span>
            </button>

            <button onClick={handlePdf} disabled={!ready || busy !== null} className={secondaryButton}>
              {busy === 'pdf' ? spinner : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
                </svg>
              )}
              <span>Baixar PDF</span>
            </button>

            <button onClick={handleMd} disabled={!ready || busy !== null} className={secondaryButton}>
              {busy === 'md' ? spinner : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              )}
              <span>Baixar Markdown</span>
            </button>

            {!ready && (
              <p className="text-[10px] font-mono text-muted text-center">
                {status === 'running' ? 'Disponível quando a análise terminar.' : 'Relatório não gerado.'}
              </p>
            )}
            {error && <p className="text-[10px] font-mono text-crit text-center max-w-[210px]">{error}</p>}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">
            Distribuição por severidade <span className="normal-case tracking-normal">(sem falsos positivos)</span>
          </p>
          <div className="h-2 rounded-full overflow-hidden flex bg-surface-3">
            {SEVERITIES.map((sev) => {
              const pct = severityTotal > 0 ? (stats[sev] / severityTotal) * 100 : 0;
              return pct > 0 ? <div key={sev} className={`${SEV_BG[sev]} h-full`} style={{ width: `${pct}%` }} /> : null;
            })}
          </div>
          <div className="flex gap-4 mt-2">
            {SEVERITIES.map((sev) => (
              <span key={sev} className={`text-[10px] font-mono ${SEV_TEXT[sev]} flex items-center gap-1`}>
                <span className={`w-1.5 h-1.5 rounded-full ${SEV_BG[sev]}`} /> {SEV_LABEL[sev]} ({stats[sev]})
              </span>
            ))}
          </div>
        </div>
      </section>

      <ReportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        domain={domain}
        report={report}
        onDownloadPdf={handlePdf}
      />
    </>
  );
}

function Metric({ value, label, cls = 'text-foreground' }: { value: number; label: string; cls?: string }) {
  return (
    <div>
      <p className={`text-3xl font-display font-700 leading-none ${cls}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}

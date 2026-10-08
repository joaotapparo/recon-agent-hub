/**
 * ReportModal.tsx
 * ---------------
 * Full-screen overlay that renders a clean, printable version of the scan report.
 *
 * Print styles are injected via a <style id="print-styles"> tag that is added
 * when the modal opens and removed when it closes. This ensures the modal
 * content fills the page and all other DOM is hidden when the user triggers
 * Ctrl+P / window.print().
 */

import { useEffect, useRef } from 'react';
import type { ReportData } from '../services/reportService';
import { printReportAsPdf } from '../services/reportService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: ReportData | null;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const SEV_LABEL: Record<string, string> = {
  critical: 'CRÍTICO',
  high: 'ALTO',
  medium: 'MÉDIO',
  low: 'BAIXO',
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmado',
  false_positive: 'Falso Positivo',
  analyzing: 'Em Análise',
};

export default function ReportModal({ isOpen, onClose, data }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  // Inject / remove print styles
  useEffect(() => {
    if (!isOpen) return;

    const style = document.createElement('style');
    style.id = 'reconsec-print-styles';
    style.textContent = `
      @media print {
        body > *:not(#reconsec-print-root) { display: none !important; }
        #reconsec-print-root { position: static !important; background: white !important; }
        #reconsec-print-root .no-print { display: none !important; }
        #reconsec-print-root .print-page { page-break-after: always; }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.getElementById('reconsec-print-styles')?.remove();
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  const criticalCount = data.findings.filter((f) => f.severity === 'critical').length;
  const highCount = data.findings.filter((f) => f.severity === 'high').length;
  const mediumCount = data.findings.filter((f) => f.severity === 'medium').length;
  const lowCount = data.findings.filter((f) => f.severity === 'low').length;

  return (
    <div
      id="reconsec-print-root"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
    >
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal container */}
      <div
        ref={printRef}
        className="relative z-10 w-full max-w-3xl mx-auto my-8 rounded-xl border border-zinc-800 overflow-hidden"
        style={{ background: '#0f0f11' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div
          className="no-print flex items-center justify-between px-6 py-4 border-b border-zinc-800"
          style={{ background: '#0a0a0c' }}
        >
          <div>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
              ReconSec • Relatório de Segurança
            </p>
            <h2 className="font-mono text-sm text-white font-semibold mt-0.5">{data.domain}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printReportAsPdf()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/70 text-zinc-300 hover:text-white font-mono text-[10px] tracking-widest uppercase transition-all"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Salvar PDF
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
              title="Fechar (Esc)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Printable body */}
        <div className="px-8 py-7 space-y-8" style={{ background: '#0f0f11' }}>

          {/* Cover / meta */}
          <div className="border-b border-zinc-800 pb-7">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mb-1">
                  Relatório de Segurança
                </p>
                <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
                  {data.domain}
                </h1>
                <p className="text-xs font-mono text-zinc-500 mt-1">{data.date}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
                  Scan ID
                </p>
                <p className="text-xs font-mono text-zinc-400 mt-0.5 break-all max-w-[180px]">
                  {data.scanId}
                </p>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mb-3">
              Resumo executivo
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total de achados', value: data.findings.length, color: '#a1a1aa' },
                { label: 'Críticos', value: criticalCount, color: SEV_COLOR.critical },
                { label: 'Altos', value: highCount, color: SEV_COLOR.high },
                { label: 'Subdomínios', value: data.stats.subdomains, color: '#818cf8' },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-lg border border-zinc-800 px-4 py-3"
                  style={{ background: '#18181b' }}
                >
                  <p className="text-2xl font-mono font-bold" style={{ color: c.color }}>
                    {c.value}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Severity distribution bar */}
          <div>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mb-2">
              Distribuição por severidade
            </p>
            <div className="h-2 rounded-full overflow-hidden flex">
              {[
                { sev: 'critical', count: criticalCount },
                { sev: 'high', count: highCount },
                { sev: 'medium', count: mediumCount },
                { sev: 'low', count: lowCount },
              ].map(({ sev, count }) => {
                const pct = data.findings.length > 0 ? (count / data.findings.length) * 100 : 0;
                return pct > 0 ? (
                  <div
                    key={sev}
                    style={{ width: `${pct}%`, background: SEV_COLOR[sev] }}
                  />
                ) : null;
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
              {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                const count = data.findings.filter((f) => f.severity === sev).length;
                return (
                  <span key={sev} className="flex items-center gap-1 text-[10px] font-mono" style={{ color: SEV_COLOR[sev] }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[sev] }} />
                    {SEV_LABEL[sev]} ({count})
                  </span>
                );
              })}
            </div>
          </div>

          {/* Findings list */}
          <div>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mb-4">
              Achados detalhados
            </p>
            <div className="space-y-3">
              {data.findings.length === 0 && (
                <p className="text-xs font-mono text-zinc-600">Nenhum achado registrado.</p>
              )}
              {data.findings.map((f, idx) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-zinc-800 px-5 py-4"
                  style={{ background: '#18181b' }}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-mono text-zinc-600">{String(idx + 1).padStart(2, '0')}</span>
                      <span
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ color: SEV_COLOR[f.severity], background: SEV_COLOR[f.severity] + '22' }}
                      >
                        {SEV_LABEL[f.severity]}
                      </span>
                      <h3 className="text-sm font-mono font-semibold text-zinc-100">{f.title}</h3>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {STATUS_LABEL[f.status] ?? f.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    <span className="text-[10px] font-mono text-zinc-500">
                      Alvo: <span className="text-zinc-300">{f.target}</span>
                    </span>
                    {f.file && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        Arquivo: <span className="text-zinc-300">{f.file}</span>
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-zinc-500">
                      Tipo: <span className="text-zinc-300">{f.type}</span>
                    </span>
                  </div>
                  {f.description && (
                    <p className="mt-2 text-[11px] font-mono text-zinc-400 leading-relaxed">
                      {f.description}
                    </p>
                  )}
                  {f.aiValidation && (
                    <p className="mt-2 text-[10px] font-mono text-indigo-400">
                      ✦ IA: {f.aiValidation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-800 pt-5">
            <p className="text-[10px] font-mono text-zinc-600 text-center">
              Gerado por ReconSec Security Platform • {new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

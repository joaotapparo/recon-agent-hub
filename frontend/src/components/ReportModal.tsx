/**
 * ReportModal.tsx
 * ---------------
 * Mostra o relatório Markdown gerado pelo backend (GET /api/scans/{id}/report).
 */

import { useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ApiReport } from '../lib/api';
import { formatDateTime } from '../lib/adapters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  report: ApiReport | null;
  onDownloadPdf: () => void;
}

// Sem o plugin de tipografia do Tailwind: estilos mínimos para o Markdown.
const markdownCls = [
  'text-sm text-zinc-300 leading-relaxed',
  '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-6 [&_h1]:mb-3',
  '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-zinc-800 [&_h2]:pb-1',
  '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_h3]:mt-5 [&_h3]:mb-2',
  '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-zinc-900 [&_code]:px-1 [&_code]:rounded',
  '[&_pre]:bg-zinc-950 [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:rounded [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:w-full [&_table]:my-3 [&_table]:text-xs [&_th]:text-left [&_th]:border [&_th]:border-zinc-800 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-zinc-900',
  '[&_td]:border [&_td]:border-zinc-800 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400',
  '[&_a]:text-sky-400 [&_a]:underline [&_strong]:text-white [&_hr]:border-zinc-800 [&_hr]:my-4',
].join(' ');

export default function ReportModal({ isOpen, onClose, domain, report, onDownloadPdf }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || !report) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-3xl mx-auto my-8 rounded-xl border border-zinc-800 overflow-hidden"
        style={{ background: '#0f0f11' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0"
          style={{ background: '#0a0a0c' }}
        >
          <div>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
              ReconSec • Relatório de Segurança
            </p>
            <h2 className="font-mono text-sm text-white font-semibold mt-0.5">{domain}</h2>
            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
              Scan #{report.scan_job_id} • gerado em {formatDateTime(report.generated_at)} •{' '}
              {report.ai_model_used === 'none' ? 'sem síntese da IA' : `modelo ${report.ai_model_used}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/70 text-zinc-300 hover:text-white font-mono text-[10px] tracking-widest uppercase transition-all cursor-pointer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Baixar PDF
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Fechar (Esc)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <article className={`px-8 py-6 ${markdownCls}`}>
          <Markdown remarkPlugins={[remarkGfm]}>{report.markdown_content}</Markdown>
        </article>
      </div>
    </div>
  );
}

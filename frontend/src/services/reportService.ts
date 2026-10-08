/**
 * reportService.ts
 * -----------------
 * Abstraction layer for report-related operations.
 *
 * FRONTEND-ONLY MODE (current): all functions work with local/mock data and
 * browser APIs (Blob, URL.createObjectURL, window.print).
 *
 * BACKEND INTEGRATION: When the API is ready, replace the body of each
 * function with the appropriate fetch() call. The function signatures and
 * return types must NOT change — consumers (FinalReport.tsx, etc.) will keep
 * working without modification.
 *
 * Expected future endpoints (example — adjust to your API contract):
 *   GET  /api/scans/:scanId/report          → JSON report data
 *   GET  /api/scans/:scanId/export/pdf      → binary PDF
 *   GET  /api/scans/:scanId/export/markdown → text/markdown
 */

import type { Finding } from '../types';
import type { ScanDataset } from '../mockData';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportData {
  scanId: string;
  domain: string;
  date: string;
  findings: Finding[];
  stats: ScanDataset['stats'];
}

// ---------------------------------------------------------------------------
// Helpers (internal — not exported)
// ---------------------------------------------------------------------------

function severityLabel(s: Finding['severity']): string {
  return { critical: 'CRÍTICO', high: 'ALTO', medium: 'MÉDIO', low: 'BAIXO' }[s] ?? s.toUpperCase();
}

function statusLabel(s: Finding['status']): string {
  return (
    { confirmed: 'Confirmado', false_positive: 'Falso positivo', analyzing: 'Em análise' }[s] ??
    s
  );
}

function buildMarkdown(data: ReportData): string {
  const lines: string[] = [];

  lines.push(`# Relatório de Segurança — ${data.domain}`);
  lines.push(`**Data da análise:** ${data.date}`);
  lines.push(`**Scan ID:** ${data.scanId}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Resumo executivo');
  lines.push('');
  lines.push(`| Métrica | Valor |`);
  lines.push(`|---|---|`);
  lines.push(`| Total de achados | ${data.findings.length} |`);
  lines.push(`| Críticos | ${data.stats.critical} |`);
  lines.push(`| Altos | ${data.stats.high} |`);
  lines.push(`| Médios | ${data.stats.medium} |`);
  lines.push(`| Baixos | ${data.stats.low} |`);
  lines.push(`| Subdomínios | ${data.stats.subdomains} |`);
  lines.push(`| Portas abertas | ${data.stats.openPorts} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Achados detalhados');
  lines.push('');

  data.findings.forEach((f, i) => {
    lines.push(`### ${i + 1}. ${f.title}`);
    lines.push('');
    lines.push(`- **Severidade:** ${severityLabel(f.severity)}`);
    lines.push(`- **Tipo:** ${f.type}`);
    lines.push(`- **Alvo:** \`${f.target}\``);
    if (f.file) lines.push(`- **Arquivo:** \`${f.file}\``);
    lines.push(`- **Status:** ${statusLabel(f.status)}`);
    lines.push(`- **Data:** ${f.date}`);
    if (f.description) {
      lines.push('');
      lines.push(`> ${f.description}`);
    }
    if (f.aiValidation) {
      lines.push('');
      lines.push(`**Validação IA:** ${f.aiValidation}`);
    }
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('*Gerado por ReconSec Security Platform*');

  return lines.join('\n');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the browser can process the click
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getReportData
 * Returns the full report data for a given scan.
 *
 * BACKEND: replace body with:
 *   const res = await fetch(`/api/scans/${scanId}/report`);
 *   return res.json();
 */
export async function getReportData(scanId: string, dataset: ScanDataset): Promise<ReportData> {
  // Frontend-only: return local dataset wrapped in ReportData shape
  return {
    scanId,
    domain: dataset.domain,
    date: dataset.date,
    findings: dataset.findings,
    stats: dataset.stats,
  };
}

/**
 * downloadMarkdown
 * Generates a .md report and triggers a browser download.
 *
 * BACKEND: replace body with:
 *   const res = await fetch(`/api/scans/${scanId}/export/markdown`);
 *   const blob = await res.blob();
 *   triggerDownload(blob, `relatorio-${domain}.md`);
 */
export async function downloadMarkdown(
  scanId: string,
  dataset: ScanDataset
): Promise<void> {
  const data = await getReportData(scanId, dataset);
  const markdown = buildMarkdown(data);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const safeDomain = data.domain.replace(/[^a-z0-9.-]/gi, '_');
  const safeDate = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `relatorio-${safeDomain}-${safeDate}.md`);
}

/**
 * printReportAsPdf
 * Opens the print dialog so the user can save the report modal as a PDF.
 * Call this AFTER the ReportModal is visible in the DOM.
 *
 * BACKEND: replace body with:
 *   const res = await fetch(`/api/scans/${scanId}/export/pdf`);
 *   const blob = await res.blob();
 *   triggerDownload(blob, `relatorio-${domain}.pdf`);
 */
export function printReportAsPdf(): void {
  window.print();
}

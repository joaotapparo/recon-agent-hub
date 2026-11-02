// Downloads do relatório gerado pelo backend (RF13): Markdown e PDF.

import { api, ApiError } from '../lib/api';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

async function download(url: string, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError(0, 'Não foi possível conectar à API.');
  }
  if (!res.ok) {
    let detail = `Erro ${res.status} ao baixar o relatório`;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      /* corpo não é JSON */
    }
    throw new ApiError(res.status, detail);
  }
  triggerDownload(await res.blob(), filename);
}

function safeName(domain: string): string {
  return domain.replace(/[^a-z0-9.-]/gi, '_');
}

export function downloadMarkdown(scanId: number, domain: string): Promise<void> {
  return download(api.reportMarkdownUrl(scanId), `relatorio-${safeName(domain)}-scan-${scanId}.md`);
}

export function downloadPdf(scanId: number, domain: string): Promise<void> {
  return download(api.reportPdfUrl(scanId), `relatorio-${safeName(domain)}-scan-${scanId}.pdf`);
}

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type ScanStatus } from '../lib/api';
import { STAGES, toDataset } from '../lib/adapters';
import { businessImpact } from '../lib/businessImpact';
import { CHECKS, evaluate, type CheckState } from '../components/SecurityChecklist';
import type { Finding, ScanDataset, SeverityLevel } from '../types';

// Relatório de uma página para quem decide (não para quem corrige):
// nota, checklist, principais riscos em linguagem de negócio e próximos passos.
// Tema claro e CSS de impressão: "Salvar como PDF" do navegador gera o arquivo.

const SEV_RANK: Record<SeverityLevel, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unrated: 0 };
const SEV_LABEL: Record<SeverityLevel, string> = {
  critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Informativo', unrated: 'Em análise',
};
const SEV_COLOR: Record<SeverityLevel, string> = {
  critical: 'bg-red-600', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-slate-400', info: 'bg-slate-300', unrated: 'bg-zinc-300',
};

const GRADES = {
  A: { color: '#16a34a', title: 'Excelente', text: 'Nenhum problema relevante encontrado nos testes realizados.' },
  B: { color: '#65a30d', title: 'Bom, com ajustes', text: 'Há apenas pontos de baixa gravidade ou ainda em análise.' },
  C: { color: '#ca8a04', title: 'Atenção', text: 'Existem problemas de gravidade média que devem ser planejados.' },
  D: { color: '#ea580c', title: 'Risco alto', text: 'Há problemas graves que precisam de correção prioritária.' },
  F: { color: '#dc2626', title: 'Crítico', text: 'Há falhas críticas expostas agora. Corrija imediatamente.' },
} as const;

function isIssue(f: Finding) {
  return f.status !== 'false_positive' && f.type !== 'open_port';
}

function gradeOf(findings: Finding[]): keyof typeof GRADES {
  const issues = findings.filter(isIssue);
  const worst = Math.max(0, ...issues.filter((f) => f.status === 'confirmed').map((f) => SEV_RANK[f.severity]));
  if (worst >= 5) return 'F';
  if (worst === 4) return 'D';
  if (worst === 3) return 'C';
  return issues.length ? 'B' : 'A';
}

const CHECK_ICON: Record<CheckState, { icon: string; cls: string; label: string }> = {
  pass: { icon: '✓', cls: 'text-green-700 bg-green-50 border-green-200', label: 'Aprovado' },
  warn: { icon: '!', cls: 'text-yellow-800 bg-yellow-50 border-yellow-200', label: 'Atenção' },
  fail: { icon: '✕', cls: 'text-red-700 bg-red-50 border-red-200', label: 'Reprovado' },
  running: { icon: '…', cls: 'text-zinc-500 bg-zinc-50 border-zinc-200', label: 'Em andamento' },
  pending: { icon: '·', cls: 'text-zinc-500 bg-zinc-50 border-zinc-200', label: 'Pendente' },
  skipped: { icon: '–', cls: 'text-zinc-500 bg-zinc-50 border-zinc-200', label: 'Não testado' },
};

export default function ExecutiveReport() {
  const { domainId, scanId } = useParams();
  const [data, setData] = useState<{ dataset: ScanDataset; ran: Set<string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dId = Number(domainId);
    const sId = Number(scanId);
    Promise.all([
      api.getDomain(dId),
      api.getScan(sId),
      api.getFindings(sId),
      api.getEvents(sId).catch(() => []),
    ])
      .then(([domain, scan, findings, events]) => {
        const ran = new Set(
          STAGES.filter((st) => events.some((e) => st.statuses.includes(e.stage as ScanStatus))).map((st) => st.key),
        );
        setData({ dataset: toDataset(domain, scan, findings), ran });
      })
      .catch((e) => setError((e as Error).message));
  }, [domainId, scanId]);

  useEffect(() => {
    if (data) document.title = `Relatório executivo — ${data.dataset.domain}`;
  }, [data]);

  const top = useMemo(() => {
    if (!data) return [];
    return data.dataset.findings
      .filter(isIssue)
      .sort((a, b) => Number(b.status === 'confirmed') - Number(a.status === 'confirmed') || SEV_RANK[b.severity] - SEV_RANK[a.severity])
      .slice(0, 3);
  }, [data]);

  if (error) return <Centered>Não foi possível carregar o relatório: {error}</Centered>;
  if (!data) return <Centered>Gerando relatório…</Centered>;

  const { dataset, ran } = data;
  const grade = gradeOf(dataset.findings);
  const g = GRADES[grade];
  const checks = CHECKS.map((c) => ({ c, ...evaluate(c, dataset.stages, dataset.findings, ran) }));
  const tested = checks.filter((r) => r.state !== 'skipped');
  const passed = tested.filter((r) => r.state === 'pass').length;
  const issues = dataset.findings.filter(isIssue);
  const confirmed = issues.filter((f) => f.status === 'confirmed');
  const urgent = confirmed.filter((f) => SEV_RANK[f.severity] >= 4).length;

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white text-zinc-900 font-sans">
      <div className="max-w-[820px] mx-auto px-4 sm:px-8 py-8 print:p-0">
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-mono uppercase tracking-wider cursor-pointer hover:bg-zinc-700"
          >
            Imprimir / salvar PDF
          </button>
        </div>

        <article className="bg-white rounded-xl shadow-sm print:shadow-none p-8 sm:p-10 space-y-8">
          <header className="flex items-start justify-between gap-6 border-b border-zinc-200 pb-6">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-500">ReconSec · Relatório executivo de segurança</p>
              <h1 className="text-3xl font-bold mt-2 break-all">{dataset.domain}</h1>
              <p className="text-sm text-zinc-500 mt-1">Análise de {dataset.date}</p>
            </div>
            <div className="text-center shrink-0">
              <div
                className="w-24 h-24 rounded-2xl flex items-center justify-center text-6xl font-black text-white"
                style={{ background: g.color }}
              >
                {grade}
              </div>
              <p className="text-xs font-semibold mt-2" style={{ color: g.color }}>{g.title}</p>
            </div>
          </header>

          <section>
            <h2 className="text-lg font-bold mb-2">Em resumo</h2>
            <p className="text-[15px] leading-relaxed text-zinc-700">
              {g.text}{' '}
              {issues.length === 0
                ? `Os ${tested.length} testes realizados não encontraram pontos de atenção.`
                : `Encontramos ${issues.length} ponto(s) de atenção, ${confirmed.length} confirmado(s) pela análise${urgent ? `, sendo ${urgent} de prioridade alta` : ''}. ${passed} de ${tested.length} verificações foram aprovadas.`}
            </p>
          </section>

          <section className="grid grid-cols-3 gap-3">
            <Stat value={dataset.stats.subdomains} label="endereços da empresa encontrados na internet" />
            <Stat value={dataset.stats.activeHosts} label="sites no ar" />
            <Stat value={dataset.stats.openPorts} label="serviços (portas) expostos" />
          </section>

          <section>
            <h2 className="text-lg font-bold mb-3">
              Verificações <span className="text-zinc-400 font-normal text-base">({passed} de {tested.length} aprovadas)</span>
            </h2>
            <ul className="grid sm:grid-cols-2 print:grid-cols-2 gap-2">
              {checks.map(({ c, state }) => {
                const s = CHECK_ICON[state];
                return (
                  <li key={c.title} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 break-inside-avoid ${s.cls}`}>
                    <span className="font-bold w-4 text-center">{s.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{c.title}</p>
                      <p className="text-xs text-zinc-600">{c.question}</p>
                    </div>
                    <span className="ml-auto text-[10px] font-mono uppercase shrink-0">{s.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {top.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Principais riscos</h2>
              <ol className="space-y-3">
                {top.map((f, i) => {
                  const impact = businessImpact(f);
                  return (
                    <li key={f.id} className="border border-zinc-200 rounded-lg p-4 break-inside-avoid">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-6 h-6 rounded-full bg-zinc-900 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <span className={`text-[10px] font-mono uppercase text-white px-2 py-0.5 rounded ${SEV_COLOR[f.severity]}`}>
                          {SEV_LABEL[f.severity]}
                        </span>
                        {f.status !== 'confirmed' && <span className="text-[10px] font-mono uppercase text-zinc-500">a confirmar</span>}
                      </div>
                      <p className="font-semibold text-[15px]">{f.title}</p>
                      <p className="text-sm text-zinc-700 mt-2"><span className="font-semibold">Por que importa: </span>{impact.why}</p>
                      <p className="text-sm text-zinc-700 mt-1"><span className="font-semibold">O que fazer: </span>{f.remediation ?? impact.fix}</p>
                    </li>
                  );
                })}
              </ol>
              {issues.length > top.length && (
                <p className="text-xs text-zinc-500 mt-2">
                  E mais {issues.length - top.length} ponto(s) no relatório técnico completo.
                </p>
              )}
            </section>
          )}

          <section className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 break-inside-avoid">
            <h2 className="text-base font-bold mb-2">Próximos passos recomendados</h2>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-zinc-700">
              {urgent > 0 && <li>Corrigir agora os {urgent} problema(s) de prioridade alta listados acima.</li>}
              {issues.length > 0 && <li>Encaminhar o relatório técnico completo para a equipe de TI ou fornecedor do site.</li>}
              <li>Repetir a análise após as correções para confirmar que os problemas foram resolvidos.</li>
              <li>Manter análises periódicas: novas falhas surgem a cada mudança no site.</li>
            </ol>
          </section>

          <footer className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-200 pt-4">
            Análise automatizada e não invasiva, feita com autorização do dono do domínio e baseada apenas no que está
            visível publicamente na internet. Ela não substitui um teste de invasão completo: a ausência de problemas
            não garante que o ambiente esteja seguro. Nota calculada pelo pior risco confirmado (F crítico, D alto,
            C médio, B baixo ou em análise, A nenhum).
          </footer>
        </article>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="border border-zinc-200 rounded-lg p-4 text-center">
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs text-zinc-500 mt-1 leading-snug">{label}</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-zinc-100 text-zinc-600 text-sm p-6 text-center">{children}</div>;
}

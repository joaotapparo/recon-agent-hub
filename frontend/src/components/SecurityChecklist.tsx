import type { ApiScanEvent } from '../lib/api';
import type { AnalysisStage, Finding, Subdomain } from '../types';

export type CheckState = 'pass' | 'warn' | 'fail' | 'running' | 'pending' | 'skipped';

export interface CheckDef {
  title: string;
  /** pergunta que o leigo entende */
  question: string;
  stage: AnalysisStage['key'];
  match: (f: Finding) => boolean;
  /** achado confirmado aqui é sempre grave, independente da severidade */
  alwaysSevere?: boolean;
  /**
   * Trecho de evento que prova que o teste rodou. Testes adicionados depois
   * (ou opcionais, como vazamentos) não rodaram em scans antigos/sem chave;
   * sem o evento eles aparecem como "Não testado", nunca como aprovados.
   * Precisa casar com a mensagem emitida em app/services/web_audit/__init__.py.
   */
  marker?: string;
  /** avaliação própria quando o resultado não vem de achados (ex.: WAF) */
  custom?: (ctx: CheckContext) => CheckState | null;
}

export interface CheckContext {
  stages: AnalysisStage[];
  findings: Finding[];
  events: ApiScanEvent[];
  subdomains: Subdomain[];
}

function wafState({ subdomains }: CheckContext): CheckState | null {
  const checked = subdomains.filter((s) => s.status === 'active' && s.waf != null);
  if (!checked.length) return null;
  return checked.every((s) => s.waf) ? 'pass' : 'warn';
}

export const CHECKS: CheckDef[] = [
  { title: 'Cadeado HTTPS', question: 'O site protege os dados com criptografia?', stage: 'web', match: (f) => f.sourceTool === 'tls-check' },
  { title: 'Proteções do navegador', question: 'O site pede ao navegador as defesas modernas?', stage: 'web', match: (f) => f.sourceTool === 'security-headers' },
  { title: 'Acesso entre sites (CORS)', question: 'Outro site consegue ler os dados dos usuários?', stage: 'web', match: (f) => f.sourceTool === 'cors-check' },
  { title: 'E-mail anti-falsificação', question: 'Alguém consegue mandar e-mail em nome da empresa?', stage: 'web', match: (f) => f.sourceTool === 'email-security' },
  { title: 'Arquivos confidenciais', question: 'Há arquivos de configuração abertos ao público?', stage: 'js', match: (f) => f.type === 'sensitive_file', alwaysSevere: true },
  { title: 'Senhas no código', question: 'O código do site entrega senhas ou chaves de API?', stage: 'js', match: (f) => f.type === 'secret' },
  { title: 'Rotas internas', question: 'O código revela partes internas do sistema?', stage: 'js', match: (f) => f.type === 'endpoint' },
  { title: 'Endereços abandonados', question: 'Algum subdomínio pode ser sequestrado?', stage: 'infra', match: (f) => f.type === 'takeover', alwaysSevere: true },
  { title: 'Software atualizado', question: 'O site usa versões com falhas conhecidas?', stage: 'web', match: (f) => f.type === 'vulnerable_component', marker: 'falhas conhecidas nas versões' },
  { title: 'Proteção do DNS', question: 'O endereço do site pode ser falsificado?', stage: 'web', match: (f) => f.sourceTool === 'dns-security', marker: 'proteção do DNS' },
  { title: 'Firewall de aplicação', question: 'Há um escudo filtrando ataques antes do site?', stage: 'web', match: () => false, marker: 'firewall de aplicação', custom: wafState },
  { title: 'E-mails vazados', question: 'E-mails da empresa aparecem em vazamentos de dados?', stage: 'web', match: (f) => f.type === 'credential_leak', marker: 'vazamentos de dados' },
];

const STATE: Record<CheckState, { label: string; color: string; icon: string }> = {
  pass: { label: 'Aprovado', color: 'text-ok border-ok/30 bg-ok/10', icon: '✓' },
  warn: { label: 'Atenção', color: 'text-med border-med/30 bg-med/10', icon: '!' },
  fail: { label: 'Reprovado', color: 'text-crit border-crit/30 bg-crit/10', icon: '✕' },
  running: { label: 'Testando', color: 'text-foreground border-border-2 bg-surface-3', icon: '' },
  pending: { label: 'Na fila', color: 'text-muted border-border bg-surface-2', icon: '·' },
  skipped: { label: 'Não testado', color: 'text-muted border-border bg-surface-2', icon: '–' },
};

export function evaluate(check: CheckDef, ctx: CheckContext): { state: CheckState; count: number } {
  const { stages, findings, events } = ctx;
  const relevant = findings.filter((f) => check.match(f) && f.status !== 'false_positive');
  const stage = stages.find((s) => s.key === check.stage);
  if (relevant.length) {
    const severe = relevant.some(
      (f) => f.status === 'confirmed' && (check.alwaysSevere || f.severity === 'critical' || f.severity === 'high'),
    );
    return { state: severe ? 'fail' : 'warn', count: relevant.length };
  }
  // A auditoria web é a única etapa que não existia nas primeiras versões:
  // scan concluído sem nenhum evento dela não rodou esses testes.
  if (stage?.status === 'completed') {
    const ran = check.marker
      ? events.some((e) => e.message.includes(check.marker!))
      : check.stage !== 'web' || events.some((e) => e.stage === 'web_audit');
    if (!ran) return { state: 'skipped', count: 0 };
    return { state: check.custom?.(ctx) ?? 'pass', count: 0 };
  }
  if (stage?.status === 'running') return { state: 'running', count: 0 };
  return { state: 'pending', count: 0 };
}

function ScoreRing({ passed, total, done }: { passed: number; total: number; done: boolean }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = total ? passed / total : 0;
  const color = !done ? '#a1a1aa' : pct >= 0.85 ? '#22c55e' : pct >= 0.5 ? '#facc15' : '#f87171';
  return (
    <svg viewBox="0 0 90 90" className="w-24 h-24 shrink-0" role="img" aria-label={`${passed} de ${total} aprovadas`}>
      <circle cx="45" cy="45" r={r} fill="none" stroke="#27272a" strokeWidth="7" />
      <circle
        cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 45 45)"
        style={{ transition: 'stroke-dashoffset 1s ease-out, stroke .4s' }}
      />
      <text x="45" y="44" textAnchor="middle" fontSize="20" fontWeight="700" fill="#fafafa" fontFamily="Rajdhani, sans-serif">
        {passed}/{total}
      </text>
      <text x="45" y="58" textAnchor="middle" fontSize="7.5" fill="#71717a" fontFamily="monospace">APROVADAS</text>
    </svg>
  );
}

type Props = CheckContext;

export default function SecurityChecklist(ctx: Props) {
  const results = CHECKS.map((check) => ({ check, ...evaluate(check, ctx) }));
  const tested = results.filter((r) => r.state !== 'skipped');
  const passed = tested.filter((r) => r.state === 'pass').length;
  const done = results.every((r) => r.state !== 'running' && r.state !== 'pending');

  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center gap-4 mb-4">
        <ScoreRing passed={passed} total={tested.length} done={done} />
        <div>
          <h2 className="font-display font-600 text-base text-foreground tracking-wide">Checklist de segurança</h2>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            {done
              ? 'Resultado de cada teste. "Atenção" ainda depende da análise da IA ou de revisão humana.'
              : 'Os testes vão sendo marcados conforme a análise avança.'}
          </p>
        </div>
      </div>

      <ul className="grid sm:grid-cols-2 gap-2">
        {results.map(({ check, state, count }) => {
          const s = STATE[state];
          return (
            <li
              key={check.title}
              className={`flex items-start gap-2.5 rounded-md border px-3 py-2 transition-colors duration-500 ${s.color}`}
            >
              <span className="w-4 h-4 mt-0.5 flex items-center justify-center shrink-0 font-mono text-xs font-bold">
                {state === 'running' ? (
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <span key={state} className="animate-pop">{s.icon}</span>
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                  {check.title}
                  {count > 0 && <span className="font-mono text-[10px] opacity-80">({count})</span>}
                </p>
                <p className="text-[11px] text-muted leading-snug">{check.question}</p>
              </div>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-wider shrink-0 mt-0.5">{s.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

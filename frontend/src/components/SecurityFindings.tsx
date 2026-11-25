import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SeverityBadge, StatusBadge, getSeverity, statusMap, typeLabel } from '../utils';
import { api, type Severity } from '../lib/api';
import type { Finding } from '../types';

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'critical', label: 'Crítico' },
  { value: 'high', label: 'Alto' },
  { value: 'medium', label: 'Médio' },
  { value: 'low', label: 'Baixo' },
  { value: 'info', label: 'Info' },
];

/**
 * Revisão humana: a IA sugere, o profissional decide. A decisão vale no
 * painel e no relatório; a sugestão da IA continua registrada.
 */
function ReviewBox({
  finding,
  readOnly,
  onReviewed,
}: {
  finding: Finding;
  readOnly: boolean;
  onReviewed: () => void;
}) {
  const initialSeverity: Severity =
    finding.severity !== 'unrated' ? finding.severity : finding.aiSeverity !== 'unrated' ? finding.aiSeverity : 'medium';
  const [severity, setSeverity] = useState<Severity>(initialSeverity);
  const [note, setNote] = useState(finding.review?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onReviewed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = () =>
    send(() => api.reviewFinding(finding.apiId, { verdict: 'true_positive', severity, note: note || null }));
  const discard = () => send(() => api.reviewFinding(finding.apiId, { verdict: 'false_positive', note: note || null }));
  const undo = () => send(() => api.undoReview(finding.apiId));

  return (
    <div className="rounded border border-border-2 bg-surface px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono text-foreground tracking-widest uppercase">Decisão do profissional</p>
        {finding.review && (
          <span className="text-[10px] font-mono text-ok bg-ok/10 border border-ok/20 px-1.5 py-0.5 rounded">
            revisado em {finding.review.date}
          </span>
        )}
      </div>

      {finding.review ? (
        <p className="text-xs text-subtle leading-relaxed">
          Você marcou como <strong className="text-foreground">{statusMap[finding.status].label.toLowerCase()}</strong>.
          A IA tinha sugerido <strong className="text-foreground">{statusMap[finding.aiStatus].label.toLowerCase()}</strong>
          {finding.aiSeverity !== 'unrated' ? ` (${finding.aiSeverity})` : ''}.
          {finding.review.note && <span className="block mt-1.5 italic">“{finding.review.note}”</span>}
        </p>
      ) : (
        <p className="text-xs text-subtle leading-relaxed">
          A classificação acima é uma sugestão da IA. Confirme ou descarte o achado: a sua decisão é a que vale no
          painel e no relatório.
        </p>
      )}

      {readOnly ? (
        <p className="text-[11px] font-mono text-muted">Revisão indisponível durante o modo demonstração.</p>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Nota (opcional): por que você confirmou ou descartou"
            className="w-full bg-bg border border-border rounded px-2.5 py-2 text-xs text-foreground placeholder:text-muted outline-none focus:border-accent/50 resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              disabled={busy}
              aria-label="Severidade ao confirmar"
              className="bg-surface-2 border border-border text-xs text-subtle font-mono rounded px-2 py-1.5 outline-none focus:border-accent/50"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={confirm}
              disabled={busy}
              className="px-3 py-1.5 rounded text-xs font-medium text-ok bg-ok/10 border border-ok/30 hover:bg-ok/20 disabled:opacity-50 transition-colors"
            >
              Confirmar achado
            </button>
            <button
              onClick={discard}
              disabled={busy}
              className="px-3 py-1.5 rounded text-xs font-medium text-subtle bg-surface-2 border border-border-2 hover:bg-surface-3 disabled:opacity-50 transition-colors"
            >
              Descartar (falso positivo)
            </button>
            {finding.review && (
              <button
                onClick={undo}
                disabled={busy}
                className="px-2 py-1.5 rounded text-[11px] font-mono text-muted hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Desfazer revisão
              </button>
            )}
          </div>
          {error && <p className="text-[11px] text-crit">{error}</p>}
        </>
      )}
    </div>
  );
}

function FindingPanel({
  finding,
  onClose,
  readOnly,
  onReviewed,
}: {
  finding: Finding;
  onClose: () => void;
  readOnly: boolean;
  onReviewed: () => void;
}) {
  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-30"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-2 border-l border-border-2 z-40 overflow-y-auto shadow-2xl"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <div className="sticky top-0 bg-surface-2 border-b border-border px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
              {typeLabel[finding.type]}
            </p>
            <h3 className="font-display font-600 text-lg text-foreground leading-snug">{finding.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-3 transition-colors shrink-0 mt-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-2 flex-wrap">
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
          </div>

          <ReviewBox key={`${finding.id}-${finding.review?.date ?? 'ia'}`} finding={finding} readOnly={readOnly} onReviewed={onReviewed} />

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Alvo', value: finding.target },
              { label: 'Data', value: finding.date },
              ...(finding.file ? [{ label: 'Arquivo', value: finding.file }] : []),
              ...(finding.line ? [{ label: 'Linha', value: `#${finding.line}` }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface border border-border rounded px-3 py-2">
                <p className="text-[10px] text-muted font-mono tracking-wide uppercase mb-0.5">{label}</p>
                <p className="text-xs font-mono text-foreground break-all">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">Descrição</p>
            <p className="text-sm text-subtle leading-relaxed">{finding.description}</p>
          </div>

          {finding.evidence && (
            <div>
              <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">Evidência</p>
              <pre className="bg-bg rounded px-3 py-2.5 text-xs font-mono text-foreground overflow-x-auto border border-border">
                {finding.evidence}
              </pre>
            </div>
          )}

          <div className="rounded border border-accent/20 bg-accent/5 px-4 py-3">
            <p className="text-[10px] font-mono text-accent tracking-widest uppercase mb-1.5">Sugestão da IA</p>
            <p className="text-xs text-subtle leading-relaxed whitespace-pre-line">{finding.aiValidation}</p>
          </div>

          {finding.remediation && (
            <div>
              <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">Correção recomendada</p>
              <p className="text-xs text-subtle leading-relaxed whitespace-pre-line">{finding.remediation}</p>
            </div>
          )}

          {finding.reproSteps && finding.reproSteps.length > 0 && (
            <div>
              <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">Passos de reprodução</p>
              <ol className="space-y-1.5">
                {finding.reproSteps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-subtle">
                    <span className="font-mono text-muted shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

/** Painel lateral de um achado, com a revisão humana. */
export function FindingDrawer({
  findings,
  selectedId,
  onClose,
  readOnly,
  onReviewed,
}: {
  findings: Finding[];
  selectedId: string | null;
  onClose: () => void;
  readOnly: boolean;
  onReviewed?: () => void;
}) {
  const selected = findings.find((f) => f.id === selectedId) ?? null;
  return (
    <AnimatePresence>
      {selected && (
        <FindingPanel
          key="panel"
          finding={selected}
          onClose={onClose}
          readOnly={readOnly || !onReviewed}
          onReviewed={() => onReviewed?.()}
        />
      )}
    </AnimatePresence>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface border border-border text-xs text-subtle font-mono rounded px-2.5 py-1.5 outline-none focus:border-accent/50 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

interface SecurityFindingsProps {
  findingsList: Finding[];
  /** chamado depois de uma revisão, pra recarregar os dados do scan */
  onReviewed?: () => void;
  /** modo demonstração: mostra a revisão, mas não deixa mudar */
  readOnly?: boolean;
  /** seleção controlada de fora (grafo, cadeias, alertas abrem o mesmo painel) */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export default function SecurityFindings({
  findingsList,
  onReviewed,
  readOnly = false,
  selectedId: controlledId,
  onSelect,
}: SecurityFindingsProps) {
  // guarda o id, não o objeto: depois de uma revisão a lista é recarregada
  const [innerId, setInnerId] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : innerId;
  const setSelectedId = (id: string | null) => (onSelect ? onSelect(id) : setInnerId(id));
  const [filterSev, setFilterSev] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = findingsList.filter((f) => {
    if (filterSev !== 'all' && f.severity !== filterSev) return false;
    if (filterType !== 'all' && f.type !== filterType) return false;
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.title.toLowerCase().includes(q) && !f.target.toLowerCase().includes(q) && !f.file?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-600 text-base text-foreground tracking-wide">Achados de Segurança</h2>
          <span className="text-[10px] font-mono text-muted bg-surface-2 border border-border px-1.5 py-0.5 rounded">
            {findingsList.length}
          </span>
        </div>
        <span className="text-[10px] font-mono text-subtle hidden sm:block">
          Exibindo {filtered.length} de {findingsList.length}
        </span>
      </div>

      <div className="px-5 py-3 border-b border-border flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1.5 flex-1 min-w-[160px] max-w-xs">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Pesquisar achado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs font-mono text-foreground outline-none placeholder:text-muted w-full"
          />
        </div>

        <Select
          value={filterSev}
          onChange={setFilterSev}
          options={[
            { value: 'all', label: 'Gravidade' },
            { value: 'critical', label: 'Crítico' },
            { value: 'high', label: 'Alto' },
            { value: 'medium', label: 'Médio' },
            { value: 'low', label: 'Baixo' },
            { value: 'info', label: 'Info' },
            { value: 'unrated', label: 'Sem severidade' },
          ]}
        />
        <Select
          value={filterType}
          onChange={setFilterType}
          options={[
            { value: 'all', label: 'Tipo' },
            { value: 'secret', label: 'Segredo' },
            { value: 'endpoint', label: 'Endpoint' },
            { value: 'sensitive_file', label: 'Arquivos sensíveis' },
            { value: 'web_config', label: 'Configuração web' },
            { value: 'vulnerable_component', label: 'Software vulnerável' },
            { value: 'credential_leak', label: 'Vazamento de dados' },
            { value: 'takeover', label: 'Takeover' },
            { value: 'open_port', label: 'Porta aberta' },
          ]}
        />
        <Select
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: 'all', label: 'Status' },
            { value: 'confirmed', label: 'Confirmado' },
            { value: 'false_positive', label: 'Falso positivo' },
            { value: 'analyzing', label: 'Aguardando IA' },
            { value: 'needs_review', label: 'Revisão manual' },
          ]}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {['Gravidade', 'Tipo', 'Título', 'Alvo', 'Arquivo', 'Status', 'Dados'].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-mono text-muted tracking-wider uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted font-mono text-[11px]">
                  {findingsList.length === 0 ? 'Nenhum achado até agora.' : 'Nenhum achado com esses filtros.'}
                </td>
              </tr>
            )}
            {filtered.map((f) => (
              <tr
                key={f.id}
                onClick={() => setSelectedId(f.id)}
                className="border-b border-border hover:bg-surface-2 transition-colors cursor-pointer animate-row-in"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${getSeverity(f.severity).dot}`} />
                    <SeverityBadge severity={f.severity} />
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-subtle text-[11px]">{typeLabel[f.type]}</td>
                <td className="px-4 py-3 font-medium text-foreground text-xs">{f.title}</td>
                <td className="px-4 py-3 font-mono text-muted text-[11px]">{f.target}</td>
                <td className="px-4 py-3 font-mono text-muted text-[11px]">
                  {f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={f.status} />
                    {f.review && (
                      <span
                        title="Revisado pelo profissional"
                        className="text-[9px] font-mono uppercase tracking-wider text-ok border border-ok/20 bg-ok/10 px-1 py-0.5 rounded"
                      >
                        revisado
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-muted text-[11px]">{f.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* controlado de fora: quem controla renderiza o FindingDrawer */}
      {!onSelect && (
        <FindingDrawer
          findings={findingsList}
          selectedId={selectedId}
          onClose={() => setSelectedId(null)}
          readOnly={readOnly}
          onReviewed={onReviewed}
        />
      )}
    </section>
  );
}

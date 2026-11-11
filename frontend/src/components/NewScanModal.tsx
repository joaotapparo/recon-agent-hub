import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SubmitResponse, VerificationChallenge } from '../lib/api';
import DomainVerification from './DomainVerification';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** rejeita com a mensagem de erro da API (formato inválido, anti-SSRF...) */
  onStartScan: (domain: string, authorized: boolean) => Promise<SubmitResponse>;
  /** confere o TXT; rejeita com a mensagem da API se ainda não apareceu */
  onVerify: (domainId: number) => Promise<void>;
}

// O backend sempre executa o pipeline completo; a lista é informativa.
const PIPELINE = [
  { label: 'Subdomínios', desc: 'subfinder' },
  { label: 'Hosts e portas', desc: 'httpx / nmap' },
  { label: 'Subdomain Takeover', desc: 'dnspython / fingerprints' },
  { label: 'Auditoria web', desc: 'HTTPS, cabeçalhos, CORS, e-mail' },
  { label: 'JS e endpoints', desc: 'crawler + regex' },
  { label: 'Secrets', desc: 'gitleaks + regex' },
  { label: 'Arquivos sensíveis', desc: '.env, .git, config' },
  { label: 'Triagem com IA', desc: 'Gemini: veredito e severidade' },
];

export default function NewScanModal({ isOpen, onClose, onStartScan, onVerify }: Props) {
  const [domainInput, setDomainInput] = useState('');
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{ id: number; domain: string; challenge: VerificationChallenge } | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    if (submitting) return;
    setError('');
    setPending(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    let clean = domainInput.trim().toLowerCase();
    clean = clean.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    if (!clean) {
      setError('Por favor, informe um domínio principal.');
      return;
    }
    if (!domainRegex.test(clean)) {
      setError('Formato de domínio inválido. Exemplo: empresa.com.br ou target.com');
      return;
    }

    if (!authorized) {
      setError('Confirme que você tem autorização para testar este domínio.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await onStartScan(clean, authorized);
      setDomainInput('');
      setAuthorized(false);
      if (res.verification) {
        // domínio novo: segundo passo, provar posse por DNS
        setPending({ id: res.domain_id, domain: clean, challenge: res.verification });
      } else {
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-lg bg-surface border border-border-2 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor" className="text-white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <div>
              <h2 className="font-display font-700 text-lg text-foreground tracking-wide">
                Nova Análise de Reconhecimento
              </h2>
              <p className="text-xs text-muted"> Alvo principal para triagem e reconhecimento</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-3 transition-colors cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {pending ? (
          <div className="p-6">
            <DomainVerification
              domain={pending.domain}
              challenge={pending.challenge}
              onVerify={async () => {
                await onVerify(pending.id);
                setPending(null);
                onClose();
              }}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-mono font-medium text-subtle uppercase tracking-wider mb-2">
              Domínio Principal *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted font-mono text-sm">
                https://
              </div>
              <input
                type="text"
                autoFocus
                value={domainInput}
                onChange={(e) => {
                  setDomainInput(e.target.value);
                  if (error) setError('');
                }}
                placeholder="exemplo.com.br"
                className="w-full pl-22 pr-4 py-2.5 bg-bg border border-border-2 rounded-lg text-sm font-mono text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              />
            </div>
            {error ? (
              <p className="mt-2 text-xs font-mono text-crit flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted font-sans">
                O pipeline automatizado irá mapear subdomínios, escanear portas, extrair JS e triar com IA.
              </p>
            )}
          </div>

          <div>
            <p className="block text-xs font-mono font-medium text-subtle uppercase tracking-wider mb-2.5">
              Etapas do pipeline
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {PIPELINE.map(({ label, desc }) => (
                <li key={label} className="flex items-baseline gap-2 text-xs text-zinc-300 min-w-0">
                  <span className="text-ok shrink-0">✓</span>
                  <span className="min-w-0">
                    {label}
                    <span className="block text-[10px] font-mono text-muted truncate">{desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-zinc-700 bg-zinc-900/60 cursor-pointer">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => {
                setAuthorized(e.target.checked);
                if (error) setError('');
              }}
              className="mt-0.5 w-4 h-4 accent-white cursor-pointer"
            />
            <span className="text-xs text-zinc-200 leading-relaxed">
              Confirmo que tenho <strong>autorização</strong> para testar este domínio. O scan só roda em alvos
              autorizados e domínios que resolvem para IP privado são bloqueados.
            </span>
          </label>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 font-mono text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !authorized}
              className="group flex items-center gap-2.5 px-6 py-2.5 rounded-lg bg-gradient-to-b from-zinc-100 to-zinc-200 hover:from-white hover:to-zinc-100 text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] border border-white/40 active:scale-95 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="group-hover:translate-x-0.5 transition-transform">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{submitting ? 'Enviando…' : 'Iniciar Reconhecimento'}</span>
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

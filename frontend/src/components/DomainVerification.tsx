import { useState } from 'react';
import type { VerificationChallenge } from '../lib/api';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sem permissão de clipboard: o valor continua visível para copiar à mão */
    }
  };
  return (
    <div>
      <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 bg-bg border border-border-2 rounded px-3 py-2 text-xs font-mono text-foreground break-all select-all">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="px-3 rounded border border-border-2 bg-surface-2 hover:bg-surface-3 text-[10px] font-mono uppercase tracking-wider text-subtle cursor-pointer shrink-0"
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

interface Props {
  domain: string;
  challenge: VerificationChallenge;
  /** rejeita com a mensagem da API quando o registro ainda não aparece */
  onVerify: () => Promise<void>;
}

export default function DomainVerification({ domain, challenge, onVerify }: Props) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const verify = async () => {
    setChecking(true);
    setError('');
    try {
      await onVerify();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-med/10 border border-med/30 flex items-center justify-center shrink-0 text-med">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Z" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
        </div>
        <div>
          <h3 className="font-display font-bold text-lg text-foreground tracking-wide">Prove que {domain} é seu</h3>
          <p className="text-xs text-subtle leading-relaxed mt-0.5">
            Só analisamos domínios cujo dono confirmou a posse. Crie o registro abaixo no painel de DNS do
            domínio (Registro.br, Cloudflare, GoDaddy, Route 53…) e clique em verificar.
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        <li className="grid grid-cols-[110px_1fr] gap-3 items-start">
          <CopyField label="Tipo" value={challenge.record_type} />
          <CopyField label="Nome / host" value={challenge.record_name} />
        </li>
        <li>
          <CopyField label="Valor / conteúdo" value={challenge.record_value} />
        </li>
      </ol>

      <p className="text-[11px] text-muted leading-relaxed">
        Alguns painéis pedem só a parte antes do domínio no nome (<code className="font-mono">_recon-agent-hub</code>).
        A propagação costuma levar de 1 a 10 minutos. A verificação vale 30 dias e é renovada sozinha enquanto o
        registro existir.
      </p>

      {error && <p className="text-xs font-mono text-crit bg-crit/10 border border-crit/25 rounded px-3 py-2">{error}</p>}

      <button
        type="button"
        onClick={verify}
        disabled={checking}
        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60 disabled:cursor-wait"
      >
        {checking && <span className="w-3 h-3 rounded-full border-2 border-zinc-950 border-t-transparent animate-spin" />}
        {checking ? 'Consultando o DNS…' : 'Verificar e iniciar análise'}
      </button>
    </div>
  );
}

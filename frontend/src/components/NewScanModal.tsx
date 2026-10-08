import { useState } from 'react';
import type { FormEvent } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStartScan: (domain: string, options: ScanOptions) => void;
}

export interface ScanOptions {
  subdomains: boolean;
  ports: boolean;
  takeover: boolean;
  jsEndpoints: boolean;
  secretsRegex: boolean;
  sensitiveFiles: boolean;
  aiTriage: boolean;
}

export default function NewScanModal({ isOpen, onClose, onStartScan }: Props) {
  const [domainInput, setDomainInput] = useState('');
  const [error, setError] = useState('');
  const [options, setOptions] = useState<ScanOptions>({
    subdomains: true,
    ports: true,
    takeover: true,
    jsEndpoints: true,
    secretsRegex: true,
    sensitiveFiles: true,
    aiTriage: true,
  });

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
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

    onStartScan(clean, options);
    setDomainInput('');
    onClose();
  };

  const toggleOption = (key: keyof ScanOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
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
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-3 transition-colors cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

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
            <label className="block text-xs font-mono font-medium text-subtle uppercase tracking-wider mb-2.5">
              Módulos Ativos do Pipeline
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { key: 'subdomains', label: 'Subdomínios', desc: 'subfinder / amass' },
                { key: 'ports', label: 'Portas Abertas', desc: 'nmap / httpx' },
                { key: 'takeover', label: 'Subdomain Takeover', desc: 'dnspython / cname' },
                { key: 'jsEndpoints', label: 'Extração de JS & APIs', desc: 'crawler + regex' },
                { key: 'secretsRegex', label: 'Varredura de Secrets', desc: 'trufflehog / gitleaks' },
                { key: 'sensitiveFiles', label: 'Arquivos Sensíveis', desc: '.env, .git, config' },
                { key: 'aiTriage', label: 'Triagem com IA', desc: 'validação e severidade' },
              ].map(({ key, label, desc }) => {
                const isChecked = options[key as keyof ScanOptions];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleOption(key as keyof ScanOptions)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                      isChecked
                        ? 'bg-zinc-900/90 border-zinc-600 text-white shadow-[0_0_12px_rgba(255,255,255,0.04)]'
                        : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border transition-colors ${
                        isChecked ? 'bg-white border-white text-black' : 'border-muted'
                      }`}
                    >
                      {isChecked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">{label}</p>
                      <p className="text-[10px] font-mono text-muted mt-0.5">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 font-mono text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="group flex items-center gap-2.5 px-6 py-2.5 rounded-lg bg-gradient-to-b from-zinc-100 to-zinc-200 hover:from-white hover:to-zinc-100 text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] border border-white/40 active:scale-95 transition-all duration-150 cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="group-hover:translate-x-0.5 transition-transform">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Iniciar Reconhecimento</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

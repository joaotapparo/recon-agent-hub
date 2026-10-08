import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#070709] text-[#e4e4e7] flex flex-col font-sans selection:bg-[#00e575]/20 selection:text-[#00e575] relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-150px] left-[15%] w-[600px] h-[600px] bg-[#00e575]/[0.035] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-100px] w-[650px] h-[650px] bg-[#00b4d8]/[0.03] rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-150px] left-[35%] w-[500px] h-[500px] bg-[#00e575]/[0.025] rounded-full blur-[140px] pointer-events-none" />

      {/* 1. Header / Navbar */}
      <header className="w-full px-8 py-5 flex items-center justify-between border-b border-[#18181b]/80 bg-[#070709]/85 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* Logo Box with subtle neon pulse */}
          <div className="w-8 h-8 rounded-lg bg-[#0e171b] border border-[#00b4d8]/30 flex items-center justify-center shadow-[0_0_15px_rgba(0,180,216,0.15)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00b4d8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-display font-bold text-lg tracking-wider text-white">ReconSec</span>
            <span className="text-[#3f3f46] text-[10px] font-mono tracking-widest uppercase">| SECURITY PLATFORM</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-1.5 text-xs font-mono font-medium text-[#71717a] hover:text-[#d4d4d8] transition-colors cursor-pointer"
          >
            Entrar
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-1.5 text-[11px] font-mono font-bold text-[#fafafa] bg-[#141416] hover:bg-[#1f1f23] hover:border-[#00e575]/40 border border-[#27272a] rounded-md transition-all cursor-pointer tracking-wider uppercase shadow-sm"
          >
            CRIAR CONTA
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 sm:px-10 lg:px-16 py-12 lg:py-16 space-y-24 relative z-10">
        
        {/* HERO SECTION (Split Left & Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
          
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-7">
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0d2116]/90 border border-[#00e575]/30 shadow-[0_0_15px_rgba(0,229,117,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00e575] animate-pulse" />
              <span className="text-[#00e575] text-[10px] font-mono font-bold tracking-widest uppercase">
                RECON & TRIAGEM COM IA
              </span>
            </div>

            {/* Main Headline */}
            <div className="space-y-1">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.6rem] font-display font-bold tracking-tight text-white leading-[1.06]">
                Conheça sua<br />superfície.
              </h1>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.6rem] font-display font-bold tracking-tight text-[#00e575] leading-[1.06] drop-shadow-[0_0_35px_rgba(0,229,117,0.25)]">
                Antecipe o risco.
              </h1>
            </div>

            {/* Subtitle / Pitch */}
            <p className="text-[#8e8e93] text-xs sm:text-[13px] font-mono leading-relaxed max-w-md">
              Recon Sec. Plataforma autônoma de varredura contínua, detecção de vetores de ataque e triagem de vulnerabilidades guiada por IA.
            </p>

            {/* Actions */}
            <div className="pt-2 space-y-4">
              <button
                onClick={() => navigate('/login')}
                className="group inline-flex items-center gap-3 px-7 py-3.5 bg-[#00e575] hover:bg-[#00f880] text-[#070709] font-mono font-bold text-xs tracking-wider uppercase rounded-lg transition-all shadow-[0_0_25px_rgba(0,229,117,0.35)] hover:shadow-[0_0_35px_rgba(0,229,117,0.55)] hover:scale-[1.02] cursor-pointer"
              >
                ACESSAR PAINEL
                <span className="text-sm transition-transform group-hover:translate-x-1">→</span>
              </button>

              <div className="flex items-center gap-2 text-[#52525b] text-[11px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e575]" />
                <span>Varredura profunda • Automação contínua • Relatórios executivos</span>
              </div>
            </div>
          </div>

          {/* Right Column: Dashboard Window Preview */}
          <div className="lg:col-span-7">
            <div className="bg-[#0c0c0f]/90 backdrop-blur-xl rounded-2xl border border-[#1f1f26] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)] hover:border-[#272732] transition-all overflow-hidden group">
              {/* Window Header */}
              <div className="px-5 py-3 bg-[#111116] border-b border-[#1b1b22] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f87171]/70 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]/70 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/70 inline-block" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e575] animate-ping" />
                  <span className="text-[10px] font-mono tracking-widest text-[#00e575] uppercase font-semibold">
                    SCANNER ATIVO
                  </span>
                </div>
              </div>

              {/* Window Body */}
              <div className="p-6 sm:p-7 space-y-6">
                {/* Domain & Status Tag */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-xl sm:text-2xl text-white tracking-wide">
                        cloud.globalbank.com
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider bg-[#0d2116] text-[#00e575] border border-[#00e575]/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00e575] animate-pulse" />
                        AUDITORIA CONCLUÍDA
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[#71717a] mt-1">
                      Mapeamento de perímetro externo & APIs sensíveis
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-[#52525b] hidden sm:block">
                    Score: <span className="text-[#f87171] font-bold">94/100 (Risco Elevado)</span>
                  </span>
                </div>

                {/* 4 Stat Boxes (dados mais impactantes) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#121217] border border-[#1d1d24] rounded-lg p-3.5 hover:border-[#2a2a35] transition-colors">
                    <span className="text-[9px] font-mono text-[#71717a] uppercase tracking-wider block">SUBDOMÍNIOS</span>
                    <span className="text-2xl font-display font-bold text-white mt-1 block">148</span>
                    <span className="text-[10px] font-mono text-[#00b4d8] mt-0.5 block">+12 novos</span>
                  </div>
                  <div className="bg-[#121217] border border-[#1d1d24] rounded-lg p-3.5 hover:border-[#2a2a35] transition-colors">
                    <span className="text-[9px] font-mono text-[#71717a] uppercase tracking-wider block">PORTAS ABERTAS</span>
                    <span className="text-2xl font-display font-bold text-white mt-1 block">34</span>
                    <span className="text-[10px] font-mono text-[#fbbf24] mt-0.5 block">5 expostas</span>
                  </div>
                  <div className="bg-[#121217] border border-[#1d1d24] rounded-lg p-3.5 hover:border-[#2a2a35] transition-colors">
                    <span className="text-[9px] font-mono text-[#71717a] uppercase tracking-wider block">TOTAL ACHADOS</span>
                    <span className="text-2xl font-display font-bold text-white mt-1 block">47</span>
                    <span className="text-[10px] font-mono text-[#71717a] mt-0.5 block">Triados por IA</span>
                  </div>
                  <div className="bg-[#161014] border border-[#38161d] rounded-lg p-3.5 hover:border-[#4d1f28] transition-colors">
                    <span className="text-[9px] font-mono text-[#f87171] uppercase tracking-wider block font-bold">CRÍTICOS</span>
                    <span className="text-2xl font-display font-bold text-[#f87171] mt-1 block">4</span>
                    <span className="text-[10px] font-mono text-[#f87171] mt-0.5 block">Ação imediata</span>
                  </div>
                </div>

                {/* Progress Section */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white font-medium flex items-center gap-2">
                      <span>Pipeline de Triagem Inteligente</span>
                    </span>
                    <span className="text-[#00e575] text-[11px] font-bold">100% Finalizado</span>
                  </div>

                  <div className="space-y-2 font-mono text-[11px]">
                    {[
                      { name: 'Enumeração DNS & Subdomínios', pct: '100%' },
                      { name: 'Inspeção de Infraestrutura & Portas', pct: '100%' },
                      { name: 'Análise Estática de JS & Secrets', pct: '100%' },
                      { name: 'Validação & Redução de Falsos Positivos', pct: '100%' },
                      { name: 'Geração de Relatório Executivo & Técnico', pct: '100%' },
                    ].map((step) => (
                      <div key={step.name} className="flex items-center gap-3">
                        <span className="text-[#00e575] text-xs font-bold">✓</span>
                        <span className="text-[#a1a1aa] w-56 shrink-0 truncate">{step.name}</span>
                        <div className="flex-1 h-1.5 bg-[#181820] rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#00b4d8] to-[#00e575] rounded-full w-full" />
                        </div>
                        <span className="text-[#52525b] text-[10px] w-8 text-right shrink-0">{step.pct}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Achados de Segurança Section */}
                <div className="pt-3 space-y-2.5 border-t border-[#181820]">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">Vulnerabilidades em Destaque</span>
                      <span className="text-[#00e575] text-[10px] px-2 py-0.5 bg-[#0d2116] rounded-full border border-[#00e575]/25 font-bold">
                        47 Triadas
                      </span>
                    </div>
                    <span className="text-[10px] text-[#71717a]">Prioridade Máxima</span>
                  </div>

                  <div className="space-y-2">
                    <div className="bg-[#121217] border border-[#26171d] hover:border-[#3d202b] rounded-lg p-3 flex items-center justify-between gap-3 text-xs font-mono transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#331114] text-[#f87171] border border-[#4c181d] shrink-0">
                          CRÍTICO
                        </span>
                        <span className="text-[#e4e4e7] truncate text-[11px] font-medium">
                          Token AWS IAM Exposto em Bundle JS Público
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold text-[#f87171] bg-[#331114]/50 border border-[#4c181d] shrink-0">
                        Explorável
                      </span>
                    </div>

                    <div className="bg-[#121217] border border-[#292215] hover:border-[#3d331d] rounded-lg p-3 flex items-center justify-between gap-3 text-xs font-mono transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#2e1f0e] text-[#fb923c] border border-[#4a2e16] shrink-0">
                          ALTO
                        </span>
                        <span className="text-[#e4e4e7] truncate text-[11px] font-medium">
                          Subdomínio Órfão Vulnerável a Takeover (api.staging)
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-medium text-[#fb923c] bg-[#2e1f0e]/50 border border-[#4a2e16] shrink-0">
                        Confirmado
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: 3 Cards Grid ("DA DESCOBERTA À ENTREGA") */}
        <div className="space-y-5 pt-8 border-t border-[#18181f]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00e575]" />
              <span className="text-[10px] font-mono tracking-widest text-[#71717a] uppercase font-bold">
                DA DESCOBERTA À ENTREGA
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#52525b]">01 — 03</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1 */}
            <div className="bg-[#0c0c0f] border border-[#1b1b22] hover:border-[#00b4d8]/40 rounded-xl p-6 flex flex-col justify-between transition-all hover:shadow-[0_10px_30px_-10px_rgba(0,180,216,0.15)] relative group">
              <div className="absolute top-5 right-5 text-[10px] font-mono text-[#3f3f46] group-hover:text-[#00b4d8] transition-colors">
                [01]
              </div>
              <div className="space-y-3.5">
                <div className="w-9 h-9 rounded-lg bg-[#0e171b] border border-[#00b4d8]/30 flex items-center justify-center text-[#00b4d8] shadow-[0_0_15px_rgba(0,180,216,0.1)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <h3 className="font-display font-bold text-base tracking-wide text-white">
                  Reconhecimento Automatizado
                </h3>
                <p className="text-[#71717a] text-xs font-mono leading-relaxed">
                  Mapeamento completo de subdomínios, portas abertas e endpoints expostos de forma automática e contínua.
                </p>
              </div>
              <div className="pt-6 flex items-center gap-1.5 text-[11px] font-mono text-[#00e575] font-medium">
                <span>• Descubra sua superfície de ataque</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-[#0c0c0f] border border-[#1b1b22] hover:border-[#00e575]/40 rounded-xl p-6 flex flex-col justify-between transition-all hover:shadow-[0_10px_30px_-10px_rgba(0,229,117,0.15)] relative group">
              <div className="absolute top-5 right-5 text-[10px] font-mono text-[#3f3f46] group-hover:text-[#00e575] transition-colors">
                [02]
              </div>
              <div className="space-y-3.5">
                <div className="w-9 h-9 rounded-lg bg-[#0d2116] border border-[#00e575]/30 flex items-center justify-center text-[#00e575] shadow-[0_0_15px_rgba(0,229,117,0.1)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                </div>
                <h3 className="font-display font-bold text-base tracking-wide text-white">
                  Triagem Inteligente
                </h3>
                <p className="text-[#71717a] text-xs font-mono leading-relaxed">
                  Classificação e priorização de vulnerabilidades por severidade utilizando inteligência artificial para eliminar falsos positivos.
                </p>
              </div>
              <div className="pt-6 flex items-center gap-1.5 text-[11px] font-mono text-[#00e575] font-medium">
                <span>• Priorize o que realmente importa</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-[#0c0c0f] border border-[#1b1b22] hover:border-[#a855f7]/40 rounded-xl p-6 flex flex-col justify-between transition-all hover:shadow-[0_10px_30px_-10px_rgba(168,85,247,0.15)] relative group">
              <div className="absolute top-5 right-5 text-[10px] font-mono text-[#3f3f46] group-hover:text-[#a855f7] transition-colors">
                [03]
              </div>
              <div className="space-y-3.5">
                <div className="w-9 h-9 rounded-lg bg-[#191122] border border-[#a855f7]/30 flex items-center justify-center text-[#c084fc] shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" x2="8" y1="13" y2="13"/>
                    <line x1="16" x2="8" y1="17" y2="17"/>
                  </svg>
                </div>
                <h3 className="font-display font-bold text-base tracking-wide text-white">
                  Relatórios Detalhados
                </h3>
                <p className="text-[#71717a] text-xs font-mono leading-relaxed">
                  Geração de relatórios executivos em PDF e Markdown com prova de conceito (PoC) e recomendações de mitigação.
                </p>
              </div>
              <div className="pt-6 flex items-center gap-1.5 text-[11px] font-mono text-[#00e575] font-medium">
                <span>• Da descoberta à remediação</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full py-8 text-center text-[#3f3f46] text-xs font-mono border-t border-[#141418] bg-[#070709] relative z-10">
        © 2026 ReconSec — Todos os direitos reservados
      </footer>
    </div>
  );
}

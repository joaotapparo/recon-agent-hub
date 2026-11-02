import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simula validação e redireciona direto para o painel principal
    setTimeout(() => {
      setLoading(false);
      navigate('/dashboard');
    }, 500);
  };

  const handleQuickAccess = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#070709] text-[#e4e4e7] flex flex-col font-sans selection:bg-[#00e575]/20 selection:text-[#00e575] relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-100px] left-[20%] w-[500px] h-[500px] bg-[#00e575]/[0.03] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[25%] w-[550px] h-[550px] bg-[#00b4d8]/[0.035] rounded-full blur-[150px] pointer-events-none" />

      {/* 1. Top Navbar */}
      <header className="w-full px-8 py-5 flex items-center justify-between bg-[#070709]/80 backdrop-blur-xl border-b border-[#18181b]/80 relative z-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          {/* Cyan-accented Logo Box */}
          <div className="w-8 h-8 rounded-lg bg-[#0e171b] border border-[#00b4d8]/30 flex items-center justify-center transition-all group-hover:border-[#00b4d8]/60 group-hover:shadow-[0_0_15px_rgba(0,180,216,0.25)] shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00b4d8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-lg tracking-wider text-white">ReconSec</span>
            <span className="text-[#3f3f46] text-[10px] font-mono tracking-widest uppercase hidden sm:inline">| AUTH</span>
          </div>
        </button>

        <button
          onClick={() => navigate('/')}
          className="text-xs font-mono text-[#71717a] hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <span>←</span>
          <span>Voltar ao Início</span>
        </button>
      </header>

      {/* 2. Main Login Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-[440px] bg-[#0c0c0f]/90 backdrop-blur-xl border border-[#1f1f26] rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)] p-8 sm:p-9 space-y-6">
          
          {/* Card Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#0d2116] border border-[#00e575]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00e575] animate-pulse" />
              <span className="text-[10px] font-mono tracking-widest text-[#00e575] uppercase font-bold">
                ACESSO RESTRITO
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-white pt-1">
              Entrar no ReconSec
            </h1>

            <p className="text-xs font-mono text-[#71717a] leading-relaxed">
              Autentique-se para gerenciar varreduras e acessar o painel.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-1 font-mono">
            {/* E-MAIL Input */}
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold" htmlFor="login-email">
                E-MAIL
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="analista@empresa.com"
                className="w-full px-4 py-2.5 bg-[#121217] text-[#fafafa] placeholder:text-[#3f3f46] text-xs rounded-lg border border-[#1d1d24] focus:border-[#00e575] focus:bg-[#15151c] focus:outline-none transition-all shadow-inner"
              />
            </div>

            {/* SENHA Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold" htmlFor="login-password">
                  SENHA
                </label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-[10px] text-[#52525b] hover:text-[#00e575] transition-colors"
                >
                  Esqueceu a senha?
                </a>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 bg-[#121217] text-[#fafafa] placeholder:text-[#3f3f46] text-xs rounded-lg border border-[#1d1d24] focus:border-[#00e575] focus:bg-[#15151c] focus:outline-none transition-all shadow-inner"
              />
            </div>

            {/* ENTRAR Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="group w-full py-3 bg-[#00e575] hover:bg-[#00f880] text-[#070709] font-mono font-bold text-xs tracking-wider uppercase rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-[0_0_20px_rgba(0,229,117,0.25)] hover:shadow-[0_0_28px_rgba(0,229,117,0.45)] hover:scale-[1.01]"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-[#070709]/30 border-t-[#070709] rounded-full animate-spin" />
                ) : (
                  <>
                    <span>ENTRAR NO SISTEMA</span>
                    <span className="text-sm transition-transform group-hover:translate-x-1">→</span>
                  </>
                )}
              </button>
            </div>

            {/* Divider or Demo Bypass */}
            <div className="relative py-2 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#1b1b22]" />
              </div>
              <span className="relative px-3 bg-[#0c0c0f] text-[10px] uppercase tracking-widest text-[#52525b]">
                OU ACESSO RÁPIDO
              </span>
            </div>

            {/* Quick Demo Access Button */}
            <button
              type="button"
              onClick={handleQuickAccess}
              className="w-full py-2.5 bg-[#141418] hover:bg-[#1b1b22] text-[#a1a1aa] hover:text-white border border-[#22222a] hover:border-[#2e2e38] font-mono font-medium text-[11px] tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00b4d8" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span>Acessar Painel Demonstração</span>
            </button>
          </form>

          {/* Bottom Link */}
          <div className="text-center pt-2 text-xs font-mono text-[#52525b] border-t border-[#181820]">
            Não tem uma conta corporativa?{' '}
            <button
              onClick={handleQuickAccess}
              className="text-[#00e575] hover:underline font-semibold cursor-pointer"
            >
              Criar conta
            </button>
          </div>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="w-full py-6 text-center text-[#3f3f46] text-xs font-mono border-t border-[#141418] relative z-10">
        © 2026 ReconSec — Todos os direitos reservados
      </footer>
    </div>
  );
}

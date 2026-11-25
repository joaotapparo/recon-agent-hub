// Efeitos sonoros da sala de operações, sintetizados com Web Audio (sem
// arquivos). Desligados por padrão; a escolha fica salva no navegador.

const KEY = 'recon:sound';
let ctx: AudioContext | null = null;
let enabled = readPref();
let lastPing = 0;
const listeners = new Set<(on: boolean) => void>();

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; to?: number } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  isEnabled: () => enabled,
  setEnabled(on: boolean) {
    enabled = on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* sem storage: vale só nesta aba */
    }
    if (on) sfx.ping(true); // confirma e destrava o áudio com o clique
    listeners.forEach((fn) => fn(on));
  },
  subscribe(fn: (on: boolean) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** sonar: algo encontrado (no máximo ~4 por segundo) */
  ping(force = false) {
    const now = performance.now();
    if (!force && now - lastPing < 240) return;
    lastPing = now;
    tone(1320, 0.35, { to: 880, gain: 0.07 });
  },
  /** atenção: aviso curto */
  warn() {
    tone(660, 0.18, { type: 'triangle', gain: 0.08 });
  },
  /** achado crítico: alarme de dois tons */
  alert() {
    for (let i = 0; i < 3; i++) {
      tone(880, 0.16, { type: 'square', gain: 0.05, delay: i * 0.36 });
      tone(587, 0.16, { type: 'square', gain: 0.05, delay: i * 0.36 + 0.18 });
    }
  },
  /** análise concluída: acorde subindo */
  done() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.07, delay: i * 0.11 }));
  },
};

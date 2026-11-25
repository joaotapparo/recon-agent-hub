// Nota de segurança do domínio: número de 0 a 100 e letra de A a F.
// Usada no painel (com "simular correção") e no relatório executivo.

import type { Finding, SeverityLevel } from '../types';

export const SEV_RANK: Record<SeverityLevel, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unrated: 0 };

export const GRADES = {
  A: { color: '#22c55e', print: '#16a34a', title: 'Excelente', text: 'Nenhum problema relevante encontrado nos testes realizados.' },
  B: { color: '#84cc16', print: '#65a30d', title: 'Bom, com ajustes', text: 'Há apenas pontos de baixa gravidade ou ainda em análise.' },
  C: { color: '#facc15', print: '#ca8a04', title: 'Atenção', text: 'Existem problemas de gravidade média que devem ser planejados.' },
  D: { color: '#fb923c', print: '#ea580c', title: 'Risco alto', text: 'Há problemas graves que precisam de correção prioritária.' },
  F: { color: '#f87171', print: '#dc2626', title: 'Crítico', text: 'Há falhas críticas expostas agora. Corrija imediatamente.' },
} as const;

export type Grade = keyof typeof GRADES;
const GRADE_ORDER: Grade[] = ['A', 'B', 'C', 'D', 'F'];

/** Pontos perdidos por achado. Pendente/revisão pesa pouco: ainda não é certeza. */
const PENALTY: Record<SeverityLevel, number> = { critical: 35, high: 20, medium: 8, low: 3, info: 1, unrated: 2 };

export function isIssue(f: Finding): boolean {
  return f.status !== 'false_positive' && f.type !== 'open_port';
}

export function penaltyOf(f: Finding): number {
  if (!isIssue(f)) return 0;
  if (f.status !== 'confirmed') return PENALTY.unrated;
  return PENALTY[f.severity];
}

/** 100 sem nada; cai rápido com críticos e devagar com detalhes. */
export function scoreOf(findings: Finding[], fixed: ReadonlySet<string> = new Set()): number {
  const total = findings.filter((f) => !fixed.has(f.id)).reduce((sum, f) => sum + penaltyOf(f), 0);
  return Math.round(100 * Math.exp(-total / 55));
}

function gradeByWorst(findings: Finding[]): Grade {
  const issues = findings.filter(isIssue);
  const worst = Math.max(0, ...issues.filter((f) => f.status === 'confirmed').map((f) => SEV_RANK[f.severity]));
  if (worst >= 5) return 'F';
  if (worst === 4) return 'D';
  if (worst === 3) return 'C';
  return issues.length ? 'B' : 'A';
}

function gradeByScore(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/** A pior das duas: um único crítico já é F, e muitos médios também derrubam. */
export function gradeOf(findings: Finding[], fixed: ReadonlySet<string> = new Set()): Grade {
  const remaining = findings.filter((f) => !fixed.has(f.id));
  const a = GRADE_ORDER.indexOf(gradeByWorst(remaining));
  const b = GRADE_ORDER.indexOf(gradeByScore(scoreOf(remaining)));
  return GRADE_ORDER[Math.max(a, b)];
}

export interface Contribution {
  finding: Finding;
  /** pontos que a nota sobe se só este achado for corrigido */
  gain: number;
}

/** O que mais pesa na nota, do maior ganho para o menor. */
export function contributions(findings: Finding[], fixed: ReadonlySet<string>): Contribution[] {
  const base = scoreOf(findings, fixed);
  return findings
    .filter((f) => isIssue(f) && !fixed.has(f.id))
    .map((finding) => ({ finding, gain: scoreOf(findings, new Set([...fixed, finding.id])) - base }))
    .sort((a, b) => b.gain - a.gain || SEV_RANK[b.finding.severity] - SEV_RANK[a.finding.severity]);
}

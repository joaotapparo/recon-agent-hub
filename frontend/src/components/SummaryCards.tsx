import { summaryStats } from '../mockData';

interface CardProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
  small?: boolean;
}

function Card({ label, value, sub, accent, small }: CardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3.5 flex flex-col gap-1">
      <p className="text-[10px] font-mono text-muted tracking-wider uppercase">{label}</p>
      <p className={`font-display font-700 leading-none ${small ? 'text-2xl' : 'text-3xl'} ${accent ?? 'text-foreground'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

interface SummaryCardsProps {
  stats?: typeof summaryStats;
}

export default function SummaryCards({ stats = summaryStats }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <div className="col-span-2 sm:col-span-2 lg:col-span-2">
        <Card label="Subdomínios" value={stats.subdomains} sub="encontrados" />
      </div>
      <Card label="Hosts ativos" value={stats.activeHosts} />
      <Card label="Portas abertas" value={stats.openPorts} />
      <Card label="Achados" value={stats.findings} />
      <Card label="Críticos" value={stats.critical} accent="text-crit" />
      <Card label="Alto" value={stats.high} accent="text-high" />
      <Card label="Médio" value={stats.medium} accent="text-med" />
    </div>
  );
}

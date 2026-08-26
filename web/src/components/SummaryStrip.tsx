import { formatCurrency, formatPercent } from "../lib/format";
import type { PortfolioSummary } from "../portfolio/types";

export function SummaryStrip({ summary }: { summary: PortfolioSummary }): JSX.Element {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Portfolio summary">
      <SummaryCard label="Total investment" money={summary.totalInvestment} />
      <SummaryCard label="Current value" money={summary.currentValue} />
      <SummaryCard label="Total gain/loss" money={summary.overallPnl} directional />
      <ReturnCard label="Absolute return" percent={summary.absoluteReturnPct} supporting="Overall portfolio return" />
      <ReturnCard
        label="Annualized return"
        percent={summary.annualizedReturnPct}
        supporting={summary.returnSince ? `CAGR since ${formatDate(summary.returnSince)}` : "Add a holding to calculate"}
      />
    </section>
  );
}

function ReturnCard({ label, percent, supporting }: { label: string; percent: string; supporting: string }): JSX.Element {
  const value = Number(percent);
  const color = value < 0 ? "text-loss" : value > 0 ? "text-profit" : "text-ink";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tabular-nums tracking-tight ${color}`}>
        {value !== 0 ? <span className="mr-1 text-sm">{value < 0 ? "▼" : "▲"}</span> : null}
        {formatPercent(percent, true)}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">{supporting}</p>
    </article>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
}

interface SummaryCardProps {
  label: string;
  money: string;
  percent?: string;
  directional?: boolean;
}

function SummaryCard({ label, money, percent, directional = false }: SummaryCardProps): JSX.Element {
  const negative = money.startsWith("-");
  const positive = !negative && Number(money) > 0;
  const color = directional ? negative ? "text-loss" : positive ? "text-profit" : "text-ink" : "text-ink";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tabular-nums tracking-tight ${color}`}>
        {directional && (negative || positive) ? <span className="mr-1 text-sm">{negative ? "▼" : "▲"}</span> : null}
        {formatCurrency(money)}
      </p>
      {percent !== undefined ? <p className={`mt-1 text-xs font-semibold tabular-nums ${color}`}>{formatPercent(percent, true)}</p> : null}
    </article>
  );
}

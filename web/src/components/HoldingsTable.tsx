import { useNavigate } from "react-router-dom";
import { formatCurrency, formatPercent, formatQuantity } from "../lib/format";
import type { PortfolioHolding } from "../portfolio/types";

interface HoldingsTableProps {
  holdings: PortfolioHolding[];
  onTrade(holding: PortfolioHolding, type: "BUY" | "SELL"): void;
}

export function HoldingsTable({ holdings, onTrade }: HoldingsTableProps): JSX.Element {
  const navigate = useNavigate();
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel" aria-labelledby="holdings-title">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div><h2 id="holdings-title" className="text-lg font-semibold text-ink">Holdings</h2><p className="mt-1 text-xs text-slate-500">Live prices and portfolio performance</p></div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{holdings.length} stocks</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] text-left">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3">Company</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">FIFO avg. price</th><th className="px-4 py-3 text-right">LTP</th><th className="px-4 py-3 text-right">Open cost</th><th className="px-4 py-3 text-right">Current value</th><th className="px-4 py-3 text-right">Total G/L</th><th className="px-4 py-3 text-right">Day's G/L</th><th className="px-4 py-3 text-right">Latest buy</th><th className="px-6 py-3 text-right">Latest sell</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {holdings.map((holding) => (
              <tr key={`${holding.exchange}:${holding.symbol}`} tabIndex={0} className="cursor-pointer transition hover:bg-slate-50 focus:bg-slate-50" onClick={() => navigate(`/stock/${holding.exchange}/${encodeURIComponent(holding.symbol)}`)} onKeyDown={(event) => { if (event.key === "Enter") navigate(`/stock/${holding.exchange}/${encodeURIComponent(holding.symbol)}`); }}>
                <td className="px-6 py-4">
                  <p className="font-semibold text-ink">{holding.companyName}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span>{holding.symbol} · {holding.exchange}</span>{holding.quoteStatus !== "live" ? <span className={`rounded px-1.5 py-0.5 font-semibold ${holding.quoteStatus === "unavailable" ? "bg-red-50 text-loss" : "bg-amber-50 text-amber-700"}`}>{holding.quoteStatus}</span> : null}</div>
                  <div className="mt-2 flex gap-2">
                    <TradeButton label="Buy" onClick={() => onTrade(holding, "BUY")} className="border-emerald-200 text-profit hover:bg-emerald-50" />
                    <TradeButton label="Sell" onClick={() => onTrade(holding, "SELL")} className="border-red-200 text-loss hover:bg-red-50" />
                  </div>
                </td>
                <MoneyCell value={formatQuantity(holding.quantity)} />
                <MoneyCell value={formatCurrency(holding.avgBuyPrice)} />
                <MoneyCell value={formatCurrency(holding.ltp)} />
                <MoneyCell value={formatCurrency(holding.investment)} />
                <MoneyCell value={formatCurrency(holding.currentValue)} />
                <PnlCell money={holding.totalPnl} percent={holding.totalPnlPct} />
                <PnlCell money={holding.dayPnl} percent={holding.dayPnlPct} />
                <DateCell value={holding.latestBuyDate} />
                <DateCell value={holding.latestSellDate} className="px-6" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TradeButton({ label, className, onClick }: { label: string; className: string; onClick(): void }): JSX.Element {
  return <button type="button" className={`rounded-md border px-2.5 py-1 text-[11px] font-bold ${className}`} onClick={(event) => { event.stopPropagation(); onClick(); }} onKeyDown={(event) => event.stopPropagation()}>{label}</button>;
}

function MoneyCell({ value, className = "px-4" }: { value: string; className?: string }): JSX.Element {
  return <td className={`${className} py-4 text-right text-sm font-medium tabular-nums text-ink`}>{value}</td>;
}

function DateCell({ value, className = "px-4" }: { value: string | null; className?: string }): JSX.Element {
  const formatted = value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`))
    : "—";
  return <td className={`${className} py-4 text-right text-xs font-medium tabular-nums text-slate-600`}>{formatted}</td>;
}

function PnlCell({ money, percent }: { money: string | null; percent: string | null }): JSX.Element {
  if (money === null) return <MoneyCell value="—" />;
  const negative = money.startsWith("-");
  const positive = !negative && Number(money) > 0;
  const color = negative ? "text-loss" : positive ? "text-profit" : "text-slate-600";
  return <td className={`px-4 py-4 text-right text-sm font-semibold tabular-nums ${color}`}><span className="block">{formatCurrency(money)}</span><span className="mt-1 block text-[11px]">{formatPercent(percent, true)}</span></td>;
}

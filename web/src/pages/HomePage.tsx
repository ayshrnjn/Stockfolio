import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatCompactNumber, formatCurrency, formatNumber, formatPercent, formatQuoteTime } from "../lib/format";

interface MarketIndex {
  symbol: "NIFTY50" | "SENSEX" | "NIFTYBANK" | "NIFTYIT";
  name: string;
  value: string | null;
  change: string | null;
  changePct: string | null;
  asOf: string | null;
  status: "live" | "unavailable";
}

interface ActiveCompany {
  ticker: string;
  companyName: string;
  price: string | null;
  change: string | null;
  changePct: string | null;
  volume: string | null;
}

interface MarketOverviewResponse {
  overview: { indices: MarketIndex[]; activeCompanies: ActiveCompany[]; source: string };
  stale: boolean;
  asOf: string;
}

export function HomePage(): JSX.Element {
  const { status } = useAuth();
  const [market, setMarket] = useState<MarketOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    request<MarketOverviewResponse>("/api/stocks/overview", { signal: controller.signal })
      .then(setMarket)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Market data is temporarily unavailable");
      });
    return () => controller.abort();
  }, [requestVersion]);

  const latestIndexTime = market?.overview.indices.map((index) => index.asOf)
    .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

  return (
    <main className="pb-16">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">India's market, in one view</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-6xl sm:leading-[1.04]">Track the market. Understand your returns.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Follow India's leading indices and most-active companies, then manage your own NSE and BSE portfolio with live profit and return insights.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#market-overview" className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">View today's market</a>
              <Link to={status === "authenticated" ? "/portfolio" : "/auth"} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">{status === "authenticated" ? "Open my portfolio" : "Create your portfolio"}</Link>
            </div>
          </div>
          <div className="hidden rounded-3xl border border-slate-200 bg-ink p-6 text-white shadow-panel sm:p-8 lg:flex lg:flex-col">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Built for Indian investors</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Feature title="Live market view" detail="Major indices and active stocks" />
              <Feature title="Clear performance" detail="Absolute and annualized return" />
              <Feature title="Simple holdings" detail="Average price, value and P&L" />
              <Feature title="NSE + BSE search" detail="Find stocks from any page" />
            </div>
          </div>
        </div>
      </section>

      <section id="market-overview" className="mx-auto max-w-7xl scroll-mt-28 px-5 pt-12 sm:px-8">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">Market overview</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">India's leading indices</h2></div>
          {latestIndexTime ? <p className="text-xs text-slate-500">Updated {formatQuoteTime(latestIndexTime)}</p> : null}
        </div>

        {error ? <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 sm:flex-row sm:items-center" role="alert"><span>{error}</span><button type="button" onClick={() => setRequestVersion((value) => value + 1)} className="rounded-lg border border-red-200 bg-white px-4 py-2 font-semibold">Try again</button></div> : null}
        {!market && !error ? <MarketSkeleton /> : null}
        {market ? (
          <>
            {market.stale ? <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">Showing the latest cached market snapshot while providers reconnect.</p> : null}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{market.overview.indices.map((index) => <IndexCard key={index.symbol} index={index} />)}</div>
            <section className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel" aria-labelledby="active-companies-title">
              <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:px-6">
                <div><h2 id="active-companies-title" className="text-xl font-semibold text-ink">Most active Indian companies</h2><p className="mt-1 text-sm text-slate-500">NSE stocks with the highest current trading activity</p></div>
                <span className="text-xs font-medium text-slate-400">Prices may be delayed</span>
              </div>
              {market.overview.activeCompanies.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3">Company</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Change</th><th className="px-6 py-3 text-right">Volume</th></tr></thead><tbody className="divide-y divide-slate-100">{market.overview.activeCompanies.map((company) => <CompanyRow key={`${company.ticker}:${company.companyName}`} company={company} />)}</tbody></table></div> : <p className="px-6 py-10 text-center text-sm text-slate-500">Active-company data is temporarily unavailable.</p>}
            </section>
            <p className="mt-4 text-xs leading-5 text-slate-400">Market data: {market.overview.source}. Information is for portfolio tracking, not investment advice.</p>
          </>
        ) : null}
      </section>
    </main>
  );
}

function Feature({ title, detail }: { title: string; detail: string }): JSX.Element {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></div>;
}

function IndexCard({ index }: { index: MarketIndex }): JSX.Element {
  const change = Number(index.change ?? 0);
  const color = change < 0 ? "text-loss" : change > 0 ? "text-profit" : "text-slate-600";
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-600">{index.name}</h3><span className={`h-2 w-2 rounded-full ${index.status === "live" ? "bg-profit" : "bg-slate-300"}`} aria-label={index.status} /></div><p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-ink">{formatNumber(index.value)}</p><p className={`mt-2 text-sm font-semibold tabular-nums ${color}`}>{formatNumber(index.change)} <span className="ml-1">({formatPercent(index.changePct, true)})</span></p></article>;
}

function CompanyRow({ company }: { company: ActiveCompany }): JSX.Element {
  const change = Number(company.change ?? 0);
  const color = change < 0 ? "text-loss" : change > 0 ? "text-profit" : "text-slate-600";
  return <tr className="transition hover:bg-slate-50/80"><td className="px-6 py-4"><p className="font-semibold text-ink">{company.companyName}</p><p className="mt-1 text-xs text-slate-500">NSE · Most active</p></td><td className="px-4 py-4 text-right font-semibold tabular-nums text-ink">{formatCurrency(company.price)}</td><td className={`px-4 py-4 text-right font-semibold tabular-nums ${color}`}>{formatNumber(company.change)} <span className="ml-1 text-xs">({formatPercent(company.changePct, true)})</span></td><td className="px-6 py-4 text-right text-sm font-medium tabular-nums text-slate-600">{formatCompactNumber(company.volume)}</td></tr>;
}

function MarketSkeleton(): JSX.Element {
  return <div className="mt-6 space-y-8" aria-label="Loading market overview"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white" />)}</div><div className="h-80 animate-pulse rounded-3xl bg-white" /></div>;
}

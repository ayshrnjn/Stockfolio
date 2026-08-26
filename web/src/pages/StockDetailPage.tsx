import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, request } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AddTransactionModal } from "../components/AddTransactionModal";
import { PriceChart } from "../components/PriceChart";
import {
  formatCompactNumber,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatQuoteTime,
} from "../lib/format";
import type { IndianExchange, StockDetail, StockDetailResponse } from "../stocks/types";

const symbolPattern = /^[A-Z0-9.&-]{1,20}$/;

export function StockDetailPage(): JSX.Element {
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { exchange, symbol } = useParams<{ exchange: string; symbol: string }>();
  const normalizedExchange: IndianExchange | null = exchange === "NSE" || exchange === "BSE" ? exchange : null;
  const normalizedSymbol = symbol?.trim().toUpperCase() ?? "";
  const validInstrument = normalizedExchange !== null && symbolPattern.test(normalizedSymbol);
  const [response, setResponse] = useState<StockDetailResponse | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [loading, setLoading] = useState(validInstrument);
  const [transactionOpen, setTransactionOpen] = useState(false);

  useEffect(() => {
    if (!validInstrument || !normalizedExchange) return;
    const controller = new AbortController();
    setLoading(true);
    setResponse(null);
    setError(null);
    request<StockDetailResponse>(
      `/api/stocks/${normalizedExchange}/${encodeURIComponent(normalizedSymbol)}`,
      { signal: controller.signal },
    ).then(setResponse).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError({
        message: reason instanceof Error ? reason.message : "Unable to load this stock",
        notFound: reason instanceof ApiError && reason.status === 404,
      });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [normalizedExchange, normalizedSymbol, validInstrument]);

  if (!validInstrument) return <StockError title="This stock link is not valid." message="Check the exchange and symbol, or find the company through search." />;
  if (loading) return <StockDetailSkeleton />;
  if (error) return (
    <StockError
      title={error.notFound ? "Stock not found" : "Market data is unavailable"}
      message={error.message}
    />
  );
  if (!response || !normalizedExchange) return <StockError title="Stock unavailable" message="We could not load this instrument." />;

  return (
    <main className="mx-auto min-h-[calc(100vh-7rem)] max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      {response.stale ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="status">
          Live data is temporarily unavailable. Showing the latest cached quote.
        </div>
      ) : null}
      <QuoteHeader stock={response.stock} onAdd={() => {
        if (status !== "authenticated") {
          navigate("/auth", { state: { from: location.pathname } });
          return;
        }
        setTransactionOpen(true);
      }} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,.75fr)]">
        <PriceChart exchange={normalizedExchange} symbol={normalizedSymbol} />
        <TradingSnapshot stock={response.stock} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Fundamentals stock={response.stock} />
        <CompanyProfile stock={response.stock} />
      </div>
      {transactionOpen ? <AddTransactionModal stock={response.stock} onClose={() => setTransactionOpen(false)} /> : null}
    </main>
  );
}

function QuoteHeader({ stock, onAdd }: { stock: StockDetail; onAdd(): void }): JSX.Element {
  const change = Number(stock.quote.changePct ?? 0);
  const positive = change >= 0;
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-panel sm:p-8">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{stock.exchange}</span>
            <span className="text-sm font-semibold text-slate-500">{stock.symbol}</span>
            {stock.industry ? <span className="text-sm text-slate-400">• {stock.industry}</span> : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{stock.companyName}</h1>
          <p className="mt-2 text-xs text-slate-500">As of {formatQuoteTime(stock.quote.asOf)}</p>
        </div>
        <button type="button" onClick={onAdd} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
          Add to portfolio
        </button>
      </div>
      <div className="mt-7 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-slate-100 pt-6">
        <p className="text-4xl font-semibold tabular-nums tracking-tight text-ink sm:text-5xl">{formatCurrency(stock.quote.ltp)}</p>
        {stock.quote.changePct ? (
          <p className={`mb-1 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${positive ? "bg-emerald-50 text-profit" : "bg-red-50 text-loss"}`}>
            {positive ? "▲" : "▼"} {formatCurrency(stock.quote.change)} ({formatPercent(stock.quote.changePct, true)})
          </p>
        ) : null}
      </div>
    </section>
  );
}

function TradingSnapshot({ stock }: { stock: StockDetail }): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7" aria-labelledby="snapshot-title">
      <h2 id="snapshot-title" className="text-lg font-semibold text-ink">Trading snapshot</h2>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5">
        <Metric label="Open" value={formatCurrency(stock.quote.open)} />
        <Metric label="Previous close" value={formatCurrency(stock.quote.previousClose)} />
        <Metric label="Day low" value={formatCurrency(stock.quote.dayLow)} />
        <Metric label="Day high" value={formatCurrency(stock.quote.dayHigh)} />
        <Metric label="Volume" value={formatCompactNumber(stock.quote.volume)} />
        <Metric label="Exchange" value={stock.exchange} />
      </dl>
      <RangeBar label="Day range" low={stock.quote.dayLow} high={stock.quote.dayHigh} current={stock.quote.ltp} />
      <RangeBar label="52-week range" low={stock.quote.week52Low} high={stock.quote.week52High} current={stock.quote.ltp} />
      <p className="mt-4 text-xs leading-5 text-slate-400">A dash means the data provider does not supply that field.</p>
    </section>
  );
}

function RangeBar({ label, low, high, current }: { label: string; low: string | null; high: string | null; current: string | null }): JSX.Element {
  const lowNumber = Number(low);
  const highNumber = Number(high);
  const currentNumber = Number(current);
  const usable = [lowNumber, highNumber, currentNumber].every(Number.isFinite) && highNumber > lowNumber;
  const position = usable ? Math.min(100, Math.max(0, ((currentNumber - lowNumber) / (highNumber - lowNumber)) * 100)) : 50;
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="relative mt-3 h-1.5 rounded-full bg-gradient-to-r from-red-300 via-amber-300 to-emerald-400">
        {usable ? <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink shadow" style={{ left: `${position}%` }} /> : null}
      </div>
      <div className="mt-2 flex justify-between text-xs font-medium tabular-nums text-slate-500">
        <span>{formatCurrency(low)}</span><span>{formatCurrency(high)}</span>
      </div>
    </div>
  );
}

function Fundamentals({ stock }: { stock: StockDetail }): JSX.Element {
  const data = stock.fundamentals;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7" aria-labelledby="fundamentals-title">
      <h2 id="fundamentals-title" className="text-lg font-semibold text-ink">Key fundamentals</h2>
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
        <Metric label="Market cap" value={data.marketCap ? `₹${formatNumber(data.marketCap)} Cr` : "—"} />
        <Metric label="P/E (TTM)" value={formatNumber(data.pe)} />
        <Metric label="EPS (TTM)" value={formatCurrency(data.eps)} />
        <Metric label="Book value" value={formatCurrency(data.bookValue)} />
        <Metric label="Dividend yield" value={formatPercent(data.dividendYield)} />
        <Metric label="Face value" value={formatCurrency(data.faceValue)} />
      </dl>
    </section>
  );
}

function CompanyProfile({ stock }: { stock: StockDetail }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7" aria-labelledby="profile-title">
      <h2 id="profile-title" className="text-lg font-semibold text-ink">About {stock.companyName}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {[stock.sector, stock.industry].filter(Boolean).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{tag}</span>)}
      </div>
      <p className={`mt-5 text-sm leading-7 text-slate-600 ${expanded ? "" : "line-clamp-4"}`}>
        {stock.description ?? "A company description is not available from the market data provider."}
      </p>
      {stock.description && stock.description.length > 280 ? (
        <button type="button" className="mt-3 text-sm font-semibold text-brand-700 hover:text-brand-800" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1.5 text-sm font-semibold tabular-nums text-ink">{value}</dd></div>;
}

function StockError({ title, message }: { title: string; message: string }): JSX.Element {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-7rem)] max-w-xl place-items-center px-6 text-center">
      <section>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-2xl text-loss">!</div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <Link className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white" to="/">Search stocks</Link>
      </section>
    </main>
  );
}

function StockDetailSkeleton(): JSX.Element {
  return (
    <main className="mx-auto min-h-[calc(100vh-7rem)] max-w-7xl animate-pulse px-5 py-8 sm:px-8">
      <div className="h-64 rounded-3xl bg-white shadow-panel" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.65fr_.75fr]"><div className="h-96 rounded-3xl bg-white" /><div className="h-96 rounded-3xl bg-white" /></div>
    </main>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { request } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AddTransactionModal } from "../components/AddTransactionModal";
import { HoldingsTable } from "../components/HoldingsTable";
import { SummaryStrip } from "../components/SummaryStrip";
import type {
  PortfolioDashboardResponse,
  PortfolioHolding,
} from "../portfolio/types";

interface PortfolioLocationState {
  notification?: unknown;
}

interface TradeTarget {
  holding: PortfolioHolding;
  type: "BUY" | "SELL";
}

export function PortfolioPage(): JSX.Element {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<PortfolioDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tradeTarget, setTradeTarget] = useState<TradeTarget | null>(null);
  const notification = typeof (location.state as PortfolioLocationState | null)?.notification === "string"
    ? (location.state as { notification: string }).notification
    : null;

  const loadPortfolio = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const options = signal ? { signal } : {};
      const dashboardResponse = await request<PortfolioDashboardResponse>("/api/portfolio/holdings", options);
      setDashboard(dashboardResponse);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Unable to load your portfolio");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPortfolio(controller.signal);
    return () => controller.abort();
  }, [loadPortfolio]);

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">My Portfolio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Portfolio overview</h1>
          <p className="mt-2 text-sm text-slate-500">Signed in as {user?.email}</p>
        </div>
        <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">Add another stock</Link>
      </div>

      {notification ? (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status">
          <span>{notification}</span>
          <button type="button" className="text-lg" aria-label="Dismiss notification" onClick={() => navigate(location.pathname, { replace: true })}>×</button>
        </div>
      ) : null}
      {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

      {loading ? <PortfolioSkeleton /> : null}
      {!loading && dashboard?.holdings.length === 0 ? <EmptyPortfolio /> : null}
      {!loading && dashboard && dashboard.holdings.length > 0 ? (
        <>
          {dashboard.summary.stale ? <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">Some market prices are stale or unavailable. Affected rows are labelled below.</p> : null}
          <div className="mt-6"><SummaryStrip summary={dashboard.summary} /></div>
          <div className="mt-6">
            <HoldingsTable holdings={dashboard.holdings} onTrade={(holding, type) => setTradeTarget({ holding, type })} />
          </div>
        </>
      ) : null}

      {tradeTarget ? (
        <AddTransactionModal
          initialType={tradeTarget.type}
          stock={{
            symbol: tradeTarget.holding.symbol,
            exchange: tradeTarget.holding.exchange,
            companyName: tradeTarget.holding.companyName,
            quote: { ltp: tradeTarget.holding.ltp },
          }}
          onClose={() => setTradeTarget(null)}
          onSuccess={async (transaction) => {
            setTradeTarget(null);
            navigate(location.pathname, {
              replace: true,
              state: { notification: `${transaction.type === "BUY" ? "Purchase" : "Sale"} recorded for ${transaction.symbol}` },
            });
            await loadPortfolio();
          }}
        />
      ) : null}
    </main>
  );
}

function EmptyPortfolio(): JSX.Element {
  return (
    <section className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-panel">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-2xl text-brand-700">＋</div>
      <h2 className="mt-5 text-xl font-semibold text-ink">Your portfolio is ready</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">Search for a stock and record a BUY transaction to see live holdings and profit or loss.</p>
      <Link to="/" className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white">Search for a stock</Link>
    </section>
  );
}

function PortfolioSkeleton(): JSX.Element {
  return <div className="mt-6 space-y-6" aria-label="Loading portfolio"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div><div className="h-80 animate-pulse rounded-3xl bg-white" /></div>;
}

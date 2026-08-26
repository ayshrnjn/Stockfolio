import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { request } from "../api/client";
import { formatCurrency } from "../lib/format";
import type { ChartRange, IndianExchange, StockHistoryResponse } from "../stocks/types";

const ranges: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y"];

interface PriceChartProps {
  exchange: IndianExchange;
  symbol: string;
}

export function PriceChart({ exchange, symbol }: PriceChartProps): JSX.Element {
  const [range, setRange] = useState<ChartRange>("1M");
  const [response, setResponse] = useState<StockHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    request<StockHistoryResponse>(
      `/api/stocks/${exchange}/${encodeURIComponent(symbol)}/history?range=${range}`,
      { signal: controller.signal },
    ).then(setResponse).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Unable to load price history");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [exchange, range, symbol]);

  const chartData = useMemo(() => response?.history.points.map((point) => ({
    date: point.date,
    close: Number(point.close),
  })) ?? [], [response]);
  const positive = chartData.length < 2 || chartData.at(-1)!.close >= chartData[0]!.close;
  const lineColor = positive ? "#159a63" : "#dc4c4c";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7" aria-labelledby="price-history-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="price-history-title" className="text-lg font-semibold text-ink">Price history</h2>
          <p className="mt-1 text-xs text-slate-500">Daily closing prices supplied by IndianAPI</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Chart range">
          {ranges.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${candidate === range ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-ink"}`}
              onClick={() => setRange(candidate)}
              aria-pressed={candidate === range}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 h-72 sm:h-80">
        {loading ? <ChartSkeleton /> : null}
        {!loading && error ? (
          <div className="grid h-full place-items-center rounded-2xl bg-red-50 px-6 text-center text-sm text-loss">{error}</div>
        ) : null}
        {!loading && !error && chartData.length === 0 ? (
          <div className="grid h-full place-items-center rounded-2xl bg-slate-50 text-sm text-slate-500">No historical prices are available.</div>
        ) : null}
        {!loading && !error && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e8edf4" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={58} tickFormatter={(value: number) => `₹${Math.round(value)}`} />
              <Tooltip
                labelFormatter={(label) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(String(label)))}
                formatter={(value) => [formatCurrency(String(value)), "Close"]}
                contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", boxShadow: "0 8px 30px rgba(15,23,42,.08)" }}
              />
              <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2.5} dot={chartData.length <= 5} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      {response?.stale ? <p className="mt-3 text-xs font-medium text-amber-700">Showing the last available cached history.</p> : null}
    </section>
  );
}

function ChartSkeleton(): JSX.Element {
  return <div className="h-full animate-pulse rounded-2xl bg-gradient-to-b from-slate-100 to-slate-50" aria-label="Loading price history" />;
}

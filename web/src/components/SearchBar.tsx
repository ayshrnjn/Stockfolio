import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { request } from "../api/client";
import type { StockSearchResponse, StockSearchResult } from "../stocks/types";

type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

const SEARCH_DELAY_MS = 300;
const MINIMUM_QUERY_LENGTH = 2;
const RESULTS_ID = "stock-search-results";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function SearchBar(): JSX.Element {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    const normalizedQuery = query.trim();
    const sequence = ++requestSequence.current;
    setActiveIndex(-1);

    if (normalizedQuery.length < MINIMUM_QUERY_LENGTH) {
      setStatus("idle");
      setResults([]);
      setStale(false);
      setOpen(false);
      return;
    }

    setOpen(true);
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      requestRef.current = controller;
      setStatus("loading");

      request<StockSearchResponse>(`/api/stocks/search?q=${encodeURIComponent(normalizedQuery)}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (sequence !== requestSequence.current) return;
          setResults(response.results);
          setStale(response.stale);
          setStatus(response.results.length === 0 ? "empty" : "success");
        })
        .catch((error: unknown) => {
          if (isAbortError(error) || sequence !== requestSequence.current) return;
          setResults([]);
          setStale(false);
          setStatus("error");
        })
        .finally(() => {
          if (requestRef.current === controller) requestRef.current = null;
        });
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      requestRef.current?.abort();
    };
  }, [query]);

  const selectStock = (stock: StockSearchResult): void => {
    setQuery("");
    setOpen(false);
    navigate(`/stock/${stock.exchange}/${encodeURIComponent(stock.symbol)}`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || status !== "success" || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[activeIndex >= 0 ? activeIndex : 0];
      if (selected) selectStock(selected);
    }
  };

  const showDropdown = open && status !== "idle";

  return (
    <div className="relative w-full" ref={rootRef}>
      <div className="relative">
        <svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          aria-activedescendant={activeIndex >= 0 ? `stock-result-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={RESULTS_ID}
          aria-expanded={showDropdown}
          aria-label="Search stocks by name or ticker"
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-ink shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= MINIMUM_QUERY_LENGTH) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search stocks by name or ticker"
          role="combobox"
          spellCheck={false}
          type="search"
          value={query}
        />
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" id={RESULTS_ID} role="listbox">
          {status === "loading" ? <StatusRow kind="loading">Searching Indian equities…</StatusRow> : null}
          {status === "empty" ? <StatusRow>No stocks found</StatusRow> : null}
          {status === "error" ? <StatusRow kind="error">Couldn&apos;t load results. Try again.</StatusRow> : null}
          {status === "success" ? (
            <>
              {stale ? <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">Showing last known results</p> : null}
              <ul className="max-h-80 overflow-y-auto py-1">
                {results.map((stock, index) => (
                  <li key={`${stock.exchange}:${stock.symbol}`} role="presentation">
                    <button
                      aria-selected={activeIndex === index}
                      className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition ${
                        activeIndex === index ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                      id={`stock-result-${index}`}
                      onClick={() => selectStock(stock)}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{stock.companyName}</span>
                        <span className="mt-0.5 block text-xs font-medium text-slate-500">{stock.symbol} · {stock.exchange}</span>
                      </span>
                      <span className="max-w-28 shrink-0 truncate text-xs text-slate-400">{stock.sector ?? stock.industry ?? "Equity"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusRow({ children, kind = "neutral" }: {
  children: React.ReactNode;
  kind?: "neutral" | "loading" | "error";
}): JSX.Element {
  return (
    <div className={`flex items-center gap-3 px-4 py-4 text-sm ${kind === "error" ? "text-red-600" : "text-slate-500"}`} role="status">
      {kind === "loading" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" /> : null}
      {children}
    </div>
  );
}

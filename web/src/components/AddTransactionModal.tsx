import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, request } from "../api/client";
import type { PortfolioTransaction } from "../portfolio/types";
import type { IndianExchange } from "../stocks/types";

export interface TransactionStock {
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  quote: { ltp: string | null };
}

interface AddTransactionModalProps {
  stock: TransactionStock;
  initialType?: "BUY" | "SELL";
  onClose(): void;
  onSuccess?(transaction: PortfolioTransaction): void | Promise<void>;
}

type FieldName = "quantity" | "txnDate";

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function serverFieldErrors(details: unknown): Partial<Record<FieldName, string>> {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return {};
  const result: Partial<Record<FieldName, string>> = {};
  for (const field of ["quantity", "txnDate"] as const) {
    const messages = (details as Record<string, unknown>)[field];
    if (Array.isArray(messages) && typeof messages[0] === "string") result[field] = messages[0];
  }
  return result;
}

function isPositiveDecimal(value: string): boolean {
  return /^\d{1,14}(?:\.\d{1,4})?$/.test(value) && /[1-9]/.test(value);
}

export function AddTransactionModal({ stock, initialType = "BUY", onClose, onSuccess }: AddTransactionModalProps): JSX.Element {
  const navigate = useNavigate();
  const [type, setType] = useState<"BUY" | "SELL">(initialType);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [txnDate, setTxnDate] = useState(todayInIndia());
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, submitting]);

  useEffect(() => {
    if (!txnDate) {
      setPrice("");
      setPriceError(null);
      setPriceLoading(false);
      return;
    }
    const controller = new AbortController();
    setPrice("");
    setPriceError(null);
    setPriceLoading(true);
    request<{ price: { close: string; date: string } }>(
      `/api/stocks/${stock.exchange}/${encodeURIComponent(stock.symbol)}/price-on?date=${encodeURIComponent(txnDate)}`,
      { signal: controller.signal },
    ).then((response) => {
      setPrice(response.price.close);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPriceError(error instanceof Error ? error.message : "Unable to load the market price for this date");
    }).finally(() => {
      if (!controller.signal.aborted) setPriceLoading(false);
    });
    return () => controller.abort();
  }, [stock.exchange, stock.symbol, txnDate]);

  const changeField = (field: FieldName, value: string): void => {
    idempotencyKey.current = null;
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === "quantity") setQuantity(value);
    if (field === "txnDate") setTxnDate(value);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextErrors: Partial<Record<FieldName, string>> = {};
    if (!isPositiveDecimal(quantity)) nextErrors.quantity = "Enter a positive quantity with up to 4 decimals";
    if (!txnDate) nextErrors.txnDate = "Select the transaction date";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setErrors({});
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await request<{ transaction: PortfolioTransaction }>("/api/portfolio/transactions", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          symbol: stock.symbol,
          exchange: stock.exchange,
          type,
          quantity,
          txnDate,
        }),
      });
      if (onSuccess) {
        await onSuccess(response.transaction);
        return;
      }
      navigate("/portfolio", {
        state: { notification: `${type === "BUY" ? "Purchase" : "Sale"} recorded for ${stock.symbol}` },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(serverFieldErrors(error.details));
        setFormError(error.message);
      } else {
        setFormError("Unable to save the transaction. You can retry safely.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">{stock.exchange} · {stock.symbol}</p>
            <h2 id="transaction-title" className="mt-2 text-2xl font-semibold text-ink">Add transaction</h2>
            <p className="mt-1 text-sm text-slate-500">{stock.companyName}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-xl text-slate-500 hover:bg-slate-200" aria-label="Close transaction form">×</button>
        </div>

        <form className="mt-7" onSubmit={(event) => void submit(event)} noValidate>
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Transaction type">
            {(["BUY", "SELL"] as const).map((candidate) => (
              <button key={candidate} type="button" aria-pressed={type === candidate} onClick={() => { setType(candidate); idempotencyKey.current = null; }} className={`rounded-lg py-2.5 text-sm font-bold transition ${type === candidate ? candidate === "BUY" ? "bg-white text-profit shadow-sm" : "bg-white text-loss shadow-sm" : "text-slate-500"}`}>
                {candidate}
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <TransactionField autoFocus label="Quantity" name="quantity" type="number" value={quantity} error={errors.quantity} onChange={(value) => changeField("quantity", value)} inputMode="decimal" />
            <TransactionField
              label="Market price per share (₹)"
              name="price"
              type="number"
              value={price}
              readOnly
              hint={priceLoading ? "Loading price for the selected date…" : priceError ?? "Price is set from verified market data."}
              onChange={() => undefined}
              inputMode="decimal"
            />
          </div>
          <div className="mt-5">
            <TransactionField label="Transaction date" name="txnDate" type="date" value={txnDate} max={todayInIndia()} error={errors.txnDate} onChange={(value) => changeField("txnDate", value)} />
          </div>
          {formError ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{formError}</div> : null}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={submitting || priceLoading || Boolean(priceError) || !price} className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Saving…" : `Record ${type.toLowerCase()}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

interface TransactionFieldProps {
  autoFocus?: boolean;
  label: string;
  name: string;
  type: "number" | "date";
  value: string;
  error?: string | undefined;
  inputMode?: "decimal";
  hint?: string;
  max?: string;
  readOnly?: boolean;
  onChange(value: string): void;
}

function TransactionField({ autoFocus = false, label, name, type, value, error, hint, inputMode, max, readOnly = false, onChange }: TransactionFieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input autoFocus={autoFocus} id={name} name={name} type={type} value={value} inputMode={inputMode} max={max} min={type === "number" ? "0.0001" : undefined} step={type === "number" ? "0.0001" : undefined} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${name}-message` : undefined} className={`w-full rounded-xl border px-4 py-3 text-sm text-ink shadow-sm ${readOnly ? "bg-slate-50" : "bg-white"} ${error ? "border-red-300" : "border-slate-300 focus:border-brand-500"}`} />
      {error ? <p id={`${name}-message`} className="mt-2 text-xs text-red-600">{error}</p> : null}
      {!error && hint ? <p id={`${name}-message`} className={`mt-2 text-xs ${priceErrorClass(hint)}`}>{hint}</p> : null}
    </div>
  );
}

function priceErrorClass(hint: string): string {
  return hint.includes("unavailable") || hint.includes("No closing price") ? "text-red-600" : "text-slate-500";
}

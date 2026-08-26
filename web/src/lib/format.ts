const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const quantityFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });
const compactFormatter = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 });

function finiteNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatCurrency(value: string | null): string {
  const number = finiteNumber(value);
  return number === null ? "—" : inrFormatter.format(number);
}

export function formatNumber(value: string | null): string {
  const number = finiteNumber(value);
  return number === null ? "—" : numberFormatter.format(number);
}

export function formatQuantity(value: string | null): string {
  const number = finiteNumber(value);
  return number === null ? "—" : quantityFormatter.format(number);
}

export function formatCompactNumber(value: string | null): string {
  const number = finiteNumber(value);
  return number === null ? "—" : compactFormatter.format(number);
}

export function formatPercent(value: string | null, withSign = false): string {
  const number = finiteNumber(value);
  if (number === null) return "—";
  const sign = withSign && number > 0 ? "+" : "";
  return `${sign}${numberFormatter.format(number)}%`;
}

export function formatQuoteTime(value: string | null): string {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

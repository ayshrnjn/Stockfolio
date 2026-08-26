const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;
const MARKET_TTL_MS = 60_000;
const CLOSED_MARKET_TTL_MS = 12 * 60 * 60 * 1_000;

const istFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isMarketOpen(now = new Date()): boolean {
  const parts = Object.fromEntries(
    istFormatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;

  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;

  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= MARKET_OPEN_MINUTES
    && minutesSinceMidnight <= MARKET_CLOSE_MINUTES;
}

export function defaultMarketDataTtl(now = new Date()): number {
  return isMarketOpen(now) ? MARKET_TTL_MS : CLOSED_MARKET_TTL_MS;
}

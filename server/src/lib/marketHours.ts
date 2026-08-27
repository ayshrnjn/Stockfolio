const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;
const MARKET_TTL_MS = 60_000;
const CLOSED_MARKET_TTL_MS = 12 * 60 * 60 * 1_000;
const INDIA_UTC_OFFSET_MS = 5.5 * 60 * 60 * 1_000;

const istFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function currentIndiaDate(now = new Date()): string {
  return istDateFormatter.format(now);
}

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
  if (isMarketOpen(now)) return MARKET_TTL_MS;
  return Math.min(CLOSED_MARKET_TTL_MS, millisecondsUntilNextMarketOpen(now));
}

function millisecondsUntilNextMarketOpen(now: Date): number {
  // India does not observe daylight-saving time. Shifting by the fixed offset
  // lets UTC date operations model the exchange calendar without depending on
  // the host machine's timezone.
  const indiaNow = new Date(now.getTime() + INDIA_UTC_OFFSET_MS);
  const nextOpen = new Date(indiaNow);
  nextOpen.setUTCHours(9, 15, 0, 0);

  const beforeOpenToday = indiaNow.getUTCDay() >= 1
    && indiaNow.getUTCDay() <= 5
    && indiaNow.getTime() < nextOpen.getTime();
  if (!beforeOpenToday) {
    do {
      nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
    } while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6);
  }

  return Math.max(0, nextOpen.getTime() - indiaNow.getTime());
}

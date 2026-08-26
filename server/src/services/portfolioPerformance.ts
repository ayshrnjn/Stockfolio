import { Decimal } from "decimal.js";
import { d, mul } from "../lib/money.js";

export interface PortfolioTrade {
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  date: string;
}

export interface FifoPosition {
  quantity: Decimal;
  remainingCost: Decimal;
  totalBuyCost: Decimal;
  realizedPnl: Decimal;
  latestBuyDate: string | null;
  latestSellDate: string | null;
}

export interface DatedCashFlow {
  date: string;
  amount: Decimal;
}

interface OpenLot {
  quantity: Decimal;
  price: Decimal;
}

const DAYS_PER_YEAR = 365.25;
const MINIMUM_RATE = -0.999999;
const MAXIMUM_RATE = 1_000_000;
const XIRR_ITERATIONS = 200;

/**
 * Applies sales to the oldest open purchase lots. The caller must provide
 * trades in ledger order and guarantee that the balance never becomes negative.
 */
export function calculateFifoPosition(trades: readonly PortfolioTrade[]): FifoPosition {
  const openLots: OpenLot[] = [];
  let totalBuyCost = d(0);
  let realizedPnl = d(0);
  let latestBuyDate: string | null = null;
  let latestSellDate: string | null = null;

  for (const trade of trades) {
    const quantity = d(trade.quantity);
    const price = d(trade.price);

    if (trade.type === "BUY") {
      openLots.push({ quantity, price });
      totalBuyCost = totalBuyCost.plus(mul(quantity, price));
      latestBuyDate = laterDate(latestBuyDate, trade.date);
      continue;
    }

    latestSellDate = laterDate(latestSellDate, trade.date);
    let quantityToMatch = quantity;
    let matchedCost = d(0);

    while (quantityToMatch.greaterThan(0)) {
      const lot = openLots[0];
      if (!lot) throw new Error("Invalid portfolio ledger: sell quantity exceeds available purchases");

      const matchedQuantity = Decimal.min(quantityToMatch, lot.quantity);
      matchedCost = matchedCost.plus(mul(matchedQuantity, lot.price));
      lot.quantity = lot.quantity.minus(matchedQuantity);
      quantityToMatch = quantityToMatch.minus(matchedQuantity);
      if (lot.quantity.isZero()) openLots.shift();
    }

    realizedPnl = realizedPnl.plus(mul(quantity, price).minus(matchedCost));
  }

  return {
    quantity: openLots.reduce((total, lot) => total.plus(lot.quantity), d(0)),
    remainingCost: openLots.reduce(
      (total, lot) => total.plus(mul(lot.quantity, lot.price)),
      d(0),
    ),
    totalBuyCost,
    realizedPnl,
    latestBuyDate,
    latestSellDate,
  };
}

/**
 * Calculates a money-weighted annual return from dated portfolio cash flows.
 * BUY values are negative, SELL/current valuation values are positive.
 */
export function calculateXirrPercent(cashFlows: readonly DatedCashFlow[]): Decimal {
  if (cashFlows.length < 2) return d(0);
  const ordered = [...cashFlows].sort((left, right) => left.date.localeCompare(right.date));
  if (!ordered.some((flow) => flow.amount.isNegative()) || !ordered.some((flow) => flow.amount.isPositive())) {
    return d(0);
  }

  const firstDate = parseDate(ordered[0]!.date);
  const normalized = ordered.map((flow) => ({
    amount: flow.amount.toNumber(),
    years: (parseDate(flow.date) - firstDate) / 86_400_000 / DAYS_PER_YEAR,
  }));
  const tolerance = Math.max(1, ...normalized.map((flow) => Math.abs(flow.amount))) * 1e-10;
  const netPresentValue = (rate: number): number => normalized.reduce(
    (total, flow) => total + flow.amount / ((1 + rate) ** flow.years),
    0,
  );
  if (Math.abs(netPresentValue(0)) <= tolerance) return d(0);

  let lower = MINIMUM_RATE;
  let upper = 1;
  let lowerValue = netPresentValue(lower);
  let upperValue = netPresentValue(upper);

  while (sameSign(lowerValue, upperValue) && upper < MAXIMUM_RATE) {
    upper = Math.min(MAXIMUM_RATE, upper * 2 + 1);
    upperValue = netPresentValue(upper);
  }
  if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue) || sameSign(lowerValue, upperValue)) {
    return d(0);
  }
  if (Math.abs(lowerValue) <= tolerance) return d(lower).times(100);
  if (Math.abs(upperValue) <= tolerance) return d(upper).times(100);

  for (let iteration = 0; iteration < XIRR_ITERATIONS; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const midpointValue = netPresentValue(midpoint);
    if (Math.abs(midpointValue) <= tolerance) return d(midpoint).times(100);

    if (sameSign(lowerValue, midpointValue)) {
      lower = midpoint;
      lowerValue = midpointValue;
    } else {
      upper = midpoint;
    }
  }

  return d((lower + upper) / 2).times(100);
}

function laterDate(current: string | null, candidate: string): string {
  return !current || candidate > current ? candidate : current;
}

function parseDate(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid portfolio transaction date: ${value}`);
  return timestamp;
}

function sameSign(left: number, right: number): boolean {
  return (left < 0 && right < 0) || (left > 0 && right > 0);
}

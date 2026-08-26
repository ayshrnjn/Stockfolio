import { Decimal } from "decimal.js";

type DecimalValue = string | number | Decimal;

export function d(value: DecimalValue): Decimal {
  return new Decimal(value);
}

export function add(left: DecimalValue, right: DecimalValue): Decimal {
  return d(left).plus(right);
}

export function sub(left: DecimalValue, right: DecimalValue): Decimal {
  return d(left).minus(right);
}

export function mul(left: DecimalValue, right: DecimalValue): Decimal {
  return d(left).times(right);
}

export function div(numerator: DecimalValue, denominator: DecimalValue): Decimal {
  const resolvedDenominator = d(denominator);
  return resolvedDenominator.isZero() ? d(0) : d(numerator).dividedBy(resolvedDenominator);
}

export function pct(part: DecimalValue, whole: DecimalValue): Decimal {
  return div(part, whole).times(100);
}

export function str(value: DecimalValue, decimalPlaces = 4): string {
  return d(value).toFixed(decimalPlaces);
}

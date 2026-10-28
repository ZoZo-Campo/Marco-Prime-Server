const EURO = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DECIMALS = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toNumber(value: number | string): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}

/** 2.7 -> "2,70 €" (convention française). */
export function formatEuro(value: number | string): string {
  return EURO.format(toNumber(value));
}

/** 2.7 -> "2,70" (sans symbole monétaire). */
export function formatAmount(value: number | string): string {
  return DECIMALS.format(toNumber(value));
}

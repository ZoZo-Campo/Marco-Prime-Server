import z from "zod";

const MONEY_PATTERN = /^-?\d+\.\d{2}$/;
const MAX_MONEY_CENTS = 9_999_999_999;

export const moneyStringSchema = z
  .string()
  .regex(MONEY_PATTERN)
  .refine((value) => {
    const cents = moneyToCents(value);
    return Number.isSafeInteger(cents) && Math.abs(cents) <= MAX_MONEY_CENTS;
  }, "Montant monétaire invalide");
export const positiveMoneyStringSchema = moneyStringSchema.refine(
  (value) => moneyToCents(value) > 0,
  "Le montant doit être strictement positif",
);

export function moneyToCents(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round(amount * 100);
}

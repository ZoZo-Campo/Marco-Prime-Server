import { z } from "zod";
import { moneyStringSchema } from "./money.schema";

const decimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);

export const accountingRowSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  liters: decimalStringSchema,
  purchasePricePerLiter: decimalStringSchema,
  revenue: decimalStringSchema,
  cost: moneyStringSchema,
  result: moneyStringSchema,
});

export const accountingSchema = z.object({
  version: z.literal(1),
  eventName: z.string(),
  eventDate: z.string(),
  rows: z.array(accountingRowSchema),
  updatedAt: z.string().datetime(),
  totals: z.object({
    liters: decimalStringSchema,
    cost: moneyStringSchema,
    revenue: moneyStringSchema,
    result: moneyStringSchema,
  }),
});

export type Accounting = z.infer<typeof accountingSchema>;
export type AccountingRow = z.infer<typeof accountingRowSchema>;

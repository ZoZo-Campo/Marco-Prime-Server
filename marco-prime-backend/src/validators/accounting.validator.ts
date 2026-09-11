import { z } from "zod";

const adminCardNumber = z.number().int().positive().safe();
const decimal = (decimals: number) =>
  z.string().regex(new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`));

export const accountingReadSchema = z.object({
  adminCardNumber,
});

export const accountingUpdateSchema = z.object({
  adminCardNumber,
  eventName: z.string().trim().min(1).max(100),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(z.object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(100),
    liters: decimal(3).refine((value) => Number(value) <= 100_000),
    purchasePricePerLiter: decimal(4).refine((value) => Number(value) <= 100_000),
    revenue: decimal(2).refine((value) => Number(value) <= 9_999_999.99),
  })).max(200).refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    { message: "Accounting row identifiers must be unique" },
  ),
});

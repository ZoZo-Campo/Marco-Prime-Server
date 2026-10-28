import { z } from "zod";

const adminCardNumber = z.number().int().positive().safe();
const decimal = (decimals: number) =>
  z.string().regex(new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");

export const accountingReadSchema = z.object({
  adminCardNumber,
});

export const accountingUpdateSchema = z.object({
  adminCardNumber,
  status: z.enum(["draft", "closed"]).default("draft"),
  eventName: z.string().trim().min(1).max(100),
  eventDate: calendarDate,
  eventStartTime: time.default("16:30"),
  eventEndTime: time.default("23:59"),
  rows: z.array(z.object({
    id: z.string().uuid(),
    productId: z.number().int().positive().safe(),
    label: z.string().trim().min(1).max(100),
    liters: decimal(3).refine((value) => Number(value) <= 100_000),
    units: decimal(2).optional().default("0").refine((value) => Number(value) <= 100_000),
    purchasePricePerLiter: decimal(4).refine((value) => Number(value) <= 100_000),
    revenue: decimal(2).refine((value) => Number(value) <= 9_999_999.99),
    salePrice: decimal(2).optional().default("0").refine((value) => Number(value) <= 100_000),
    saleFormat: z.enum(["unit", "25cl", "33cl", "50cl", "60cl"]).optional().default("unit"),
  })).max(200).refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    { message: "Accounting row identifiers must be unique" },
  ).refine(
    (rows) => new Set(rows.map((row) => row.productId)).size === rows.length,
    { message: "Accounting products must be unique" },
  ),
});

export const accountingExportSchema = z.object({
  adminCardNumber,
  from: z.string().datetime(),
  to: z.string().datetime(),
}).superRefine(({ from, to }, context) => {
  if (new Date(to) <= new Date(from)) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "The end date must be after the start date",
    });
  }
});

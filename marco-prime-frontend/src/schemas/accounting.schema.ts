import { z } from "zod";
import { moneyStringSchema } from "./money.schema";

const decimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);

export const accountingRowSchema = z.object({
  id: z.string().uuid(),
  productId: z.number().int().positive().nullable(),
  label: z.string(),
  liters: decimalStringSchema,
  units: decimalStringSchema.optional().default("0"),
  purchasePricePerLiter: decimalStringSchema,
  revenue: decimalStringSchema,
  salePrice: decimalStringSchema.optional().default("0"),
  saleFormat: z.enum(["unit", "25cl", "33cl", "50cl", "60cl"]).optional().default("unit"),
  cost: moneyStringSchema,
  expectedRevenue: moneyStringSchema.optional().default("0"),
  variance: moneyStringSchema.optional().default("0"),
  result: moneyStringSchema,
});

export const accountingSchema = z.object({
  version: z.literal(1),
  status: z.enum(["draft", "closed"]),
  eventName: z.string(),
  eventDate: z.string(),
  eventStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default("16:30"),
  eventEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default("23:59"),
  rows: z.array(accountingRowSchema),
  productDefaults: z.array(
    z.object({
      productId: z.number().int().positive(),
      purchasePricePerLiter: decimalStringSchema,
    }),
  ),
  closedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  totals: z.object({
    liters: decimalStringSchema,
    units: decimalStringSchema.optional().default("0"),
    cost: moneyStringSchema,
    expectedRevenue: moneyStringSchema.optional().default("0"),
    revenue: moneyStringSchema,
    variance: moneyStringSchema.optional().default("0"),
    result: moneyStringSchema,
  }),
});

const exportedSaleSchema = z.object({
  orderId: z.number().int().positive(),
  memberId: z.number().int().positive().nullable(),
  memberFirstName: z.string().nullable(),
  memberLastName: z.string().nullable(),
  productId: z.number().int().positive(),
  productName: z.string(),
  category: z.string(),
  amount: z.number().int().positive(),
  price: moneyStringSchema,
  date: z.string().datetime(),
  status: z.enum(["sale", "replacement"]),
});

const exportedRechargeSchema = z.object({
  orderId: z.number().int().positive(),
  memberId: z.number().int().positive().nullable(),
  memberFirstName: z.string().nullable(),
  memberLastName: z.string().nullable(),
  amount: moneyStringSchema,
  date: z.string().datetime(),
  paymentMethod: z.enum(["card", "cash"]).nullable(),
});

const rechargeSummarySchema = z.object({
  total: moneyStringSchema,
  card: moneyStringSchema,
  cash: moneyStringSchema,
  unknown: moneyStringSchema,
  count: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
  cashCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
});

const exportedCorrectionSchema = z.object({
  status: z.enum(["pending", "completed"]),
  originalOrderId: z.number().int().positive(),
  replacementProductId: z.number().int().positive().nullable(),
  replacementAmount: z.number().int().nonnegative(),
  reason: z.string(),
  adminMemberId: z.number().int().positive(),
  createdAt: z.string().datetime(),
  originalProductName: z.string().nullable(),
  replacementProductName: z.string().nullable(),
  refundOrderId: z.number().int().positive().optional(),
  replacementOrderId: z.number().int().positive().nullable().optional(),
  originalProductId: z.number().int().positive().optional(),
  originalAmount: z.number().int().positive().optional(),
  refunded: moneyStringSchema.optional(),
  charged: moneyStringSchema.optional(),
  balanceChange: moneyStringSchema.optional(),
  previousBalance: moneyStringSchema.optional(),
  newBalance: moneyStringSchema.optional(),
  completedAt: z.string().datetime().optional(),
});

export const accountingExportSchema = z.object({
  generatedAt: z.string().datetime(),
  range: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  accounting: accountingSchema,
  sales: z.array(exportedSaleSchema),
  recharges: z.array(exportedRechargeSchema),
  rechargeSummary: rechargeSummarySchema.optional(),
  corrections: z.array(exportedCorrectionSchema),
});

export type Accounting = z.infer<typeof accountingSchema>;
export type AccountingRow = z.infer<typeof accountingRowSchema>;
export type AccountingExport = z.infer<typeof accountingExportSchema>;

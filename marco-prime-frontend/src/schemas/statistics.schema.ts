import { z } from "zod";
import { moneyStringSchema } from "./money.schema";

export const statisticsResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  range: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  summary: z.object({
    salesLines: z.number().int().nonnegative(),
    unitsSold: z.number().int().nonnegative(),
    uniqueMembers: z.number().int().nonnegative(),
    revenue: moneyStringSchema,
    cost: moneyStringSchema,
    profit: moneyStringSchema,
    rechargeCount: z.number().int().nonnegative(),
    rechargeAmount: moneyStringSchema,
    unconfiguredProductCount: z.number().int().nonnegative(),
    legacyLineCount: z.number().int().nonnegative(),
  }),
  products: z.array(
    z.object({
      productId: z.number().int().positive(),
      name: z.string(),
      category: z.string(),
      quantity: z.number().int().nonnegative(),
      revenue: moneyStringSchema,
      cost: moneyStringSchema,
      profit: moneyStringSchema,
      costConfigured: z.boolean(),
    }),
  ),
});

export const productCostListSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    name: z.string(),
    category: z.string(),
    sellingPrice: moneyStringSchema,
    available: z.boolean(),
    costPrice: moneyStringSchema.nullable(),
  }),
);

export type StatisticsResponse = z.infer<typeof statisticsResponseSchema>;
export type ProductCost = z.infer<typeof productCostListSchema>[number];

import z from "zod";
import { paginationSchema } from "./product.schema";
import { moneyStringSchema } from "./money.schema";

export const orderSchema = z.object({
  id: z.coerce.number().int().positive(),
  product: z
    .object({
      id: z.coerce.number().int().positive(),
      name: z.string(),
    })
    .nullable(),
  member: z
    .object({
      id: z.coerce.number().int().positive(),
      firstName: z.string(),
      lastName: z.string(),
      balance: moneyStringSchema,
    })
    .nullable(),
  price: moneyStringSchema,
  amount: z.coerce.number().int().positive(),
  date: z.string().datetime(),
  ledgerKind: z.enum([
    "purchase",
    "recharge",
    "corrected-original",
    "correction-refund",
    "correction-replacement",
  ]).optional(),
  correctionOriginalOrderId: z.number().int().positive().nullable().optional(),
});

export const orderListResponseSchema = z.object({
  data: z.array(orderSchema),
  pagination: paginationSchema,
});

export type OrderSchema = z.infer<typeof orderSchema>;
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

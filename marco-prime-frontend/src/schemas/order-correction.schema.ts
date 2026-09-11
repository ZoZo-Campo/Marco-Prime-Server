import { z } from "zod";
import { moneyStringSchema } from "./money.schema";

const pendingCorrectionSchema = z.object({
  status: z.literal("pending"),
  originalOrderId: z.number().int().positive(),
  replacementProductId: z.number().int().positive().nullable(),
  replacementAmount: z.number().int().nonnegative(),
  reason: z.string(),
  adminMemberId: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

const completedCorrectionSchema = pendingCorrectionSchema.extend({
  status: z.literal("completed"),
  refundOrderId: z.number().int().positive(),
  replacementOrderId: z.number().int().positive().nullable(),
  originalProductId: z.number().int().positive(),
  originalAmount: z.number().int().positive(),
  refunded: moneyStringSchema,
  charged: moneyStringSchema,
  balanceChange: moneyStringSchema,
  previousBalance: moneyStringSchema,
  newBalance: moneyStringSchema,
  completedAt: z.string().datetime(),
});

export const correctionListSchema = z.array(z.object({
  id: z.number().int().positive(),
  product: z.object({ id: z.number().int().positive(), name: z.string() }),
  member: z.object({
    id: z.number().int().positive(),
    firstName: z.string(),
    lastName: z.string(),
    balance: moneyStringSchema,
  }).nullable(),
  price: moneyStringSchema,
  amount: z.number().int().positive(),
  date: z.string().datetime(),
  correction: z.discriminatedUnion("status", [
    pendingCorrectionSchema,
    completedCorrectionSchema,
  ]).nullable(),
}));

export type CorrectableOrder = z.infer<typeof correctionListSchema>[number];

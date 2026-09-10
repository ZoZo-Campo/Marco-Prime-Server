import { z } from "zod";

export const rechargeRequestSchema = z.object({
  transactionId: z.string().uuid(),
  cardNumber: z.number().int().positive().safe(),
  adminCardNumber: z.number().int().positive().safe().optional(),
  amount: z.number().positive().max(99_999_999.99).multipleOf(0.01),
});

export const rechargeReceiptSchema = z.object({
  success: z.boolean(),
  transaction: z.object({
    transactionId: z.string().uuid(),
    orderId: z.number(),
    date: z.date(),
    member: z.object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      cardNumber: z.number(),
    }),
    processedBy: z
      .object({
        id: z.number(),
        firstName: z.string(),
        lastName: z.string(),
        cardNumber: z.number(),
        isAdmin: z.boolean(),
      })
      .optional(),
    amount: z.string(),
    previousBalance: z.string(),
    newBalance: z.string(),
  }),
});

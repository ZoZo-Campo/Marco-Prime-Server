import { z } from "zod";

export const rechargeRequestSchema = z.object({
  transactionId: z.string().uuid(),
  cardNumber: z.number().int().positive().safe(),
  adminCardNumber: z.number().int().positive().safe().optional(),
  amount: z.number().positive().max(99_999_999.99).multipleOf(0.01),
  paymentMethod: z.enum(["card", "cash"]),
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
    paymentMethod: z.enum(["card", "cash"]),
    paymentMethodRecorded: z.boolean(),
  }),
});

export const rechargeMethodUpdateSchema = z.object({
  adminCardNumber: z.number().int().positive().safe(),
  orderId: z.number().int().positive(),
  paymentMethod: z.enum(["card", "cash"]),
});

export const rechargeCorrectionSchema = z.object({
  adminCardNumber: z.number().int().positive().safe(),
  originalOrderId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(250),
});

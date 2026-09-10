import z from "zod";
import {
  moneyStringSchema,
  moneyToCents,
  positiveMoneyStringSchema,
} from "./money.schema";

export const rechargeResponseSchema = z.object({
  success: z.literal(true),
  transaction: z.object({
    transactionId: z.string().uuid(),
    orderId: z.coerce.number().int().positive(),
    date: z.string().datetime(),
    member: z.object({
      id: z.coerce.number().int().positive(),
      firstName: z.string(),
      lastName: z.string(),
      cardNumber: z.coerce.number().int().positive().safe(),
    }),
    processedBy: z.object({
      id: z.coerce.number().int().positive(),
      firstName: z.string(),
      lastName: z.string(),
      cardNumber: z.coerce.number().int().positive().safe(),
      isAdmin: z.boolean(),
    }).optional(),
    amount: positiveMoneyStringSchema,
    previousBalance: moneyStringSchema,
    newBalance: moneyStringSchema,
  }).superRefine((transaction, context) => {
    const amount = moneyToCents(transaction.amount);
    const previous = moneyToCents(transaction.previousBalance);
    const next = moneyToCents(transaction.newBalance);
    if (next !== previous + amount) {
      context.addIssue({
        code: "custom",
        message: "Le solde du reçu ne correspond pas au rechargement",
      });
    }
  }),
});

export type RechargeResponse = z.infer<typeof rechargeResponseSchema>;

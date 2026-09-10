import z from "zod";
import {
  moneyStringSchema,
  moneyToCents,
  positiveMoneyStringSchema,
} from "./money.schema";

const purchaseTransactionSchema = z
  .object({
    transactionId: z.string().uuid(),
    orderIds: z.array(z.coerce.number().int().positive()).min(1),
    date: z.string().datetime(),
    items: z.array(
      z.object({
        product: z.object({
          id: z.coerce.number().int().positive(),
          name: z.string(),
          title: z.string(),
          price: positiveMoneyStringSchema,
        }),
        amount: z.coerce.number().int().positive().max(99),
        totalPrice: positiveMoneyStringSchema,
      }),
    ).min(1),
    member: z.object({
      id: z.coerce.number().int().positive(),
      firstName: z.string(),
      lastName: z.string(),
      cardNumber: z.coerce.number().int().positive().safe(),
    }),
    totalPrice: positiveMoneyStringSchema,
    previousBalance: moneyStringSchema,
    newBalance: moneyStringSchema,
  })
  .superRefine((transaction, context) => {
    const itemTotal = transaction.items.reduce(
      (sum, item) => sum + moneyToCents(item.totalPrice),
      0,
    );
    const total = moneyToCents(transaction.totalPrice);
    const previous = moneyToCents(transaction.previousBalance);
    const next = moneyToCents(transaction.newBalance);

    transaction.items.forEach((item, index) => {
      const expectedLineTotal =
        moneyToCents(item.product.price) * item.amount;
      if (moneyToCents(item.totalPrice) !== expectedLineTotal) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "totalPrice"],
          message: "Le total de ligne ne correspond pas au prix et à la quantité",
        });
      }
    });

    if (itemTotal !== total) {
      context.addIssue({
        code: "custom",
        message: "Le total du reçu ne correspond pas aux lignes",
      });
    }
    if (next !== previous - total) {
      context.addIssue({
        code: "custom",
        message: "Le solde du reçu ne correspond pas au débit",
      });
    }
  });

export const purchaseResponseSchema = z.object({
  success: z.literal(true),
  transaction: purchaseTransactionSchema,
});

export type PurchaseResponse = z.infer<typeof purchaseResponseSchema>;

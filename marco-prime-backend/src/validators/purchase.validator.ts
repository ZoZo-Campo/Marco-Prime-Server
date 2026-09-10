import { z } from "zod";

export const purchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  amount: z.number().int().positive().max(99),
});

export const purchaseRequestSchema = z.object({
  transactionId: z.string().uuid(),
  cardNumber: z.number().int().positive().safe(),
  items: z
    .array(purchaseItemSchema)
    .min(1)
    .max(50)
    .superRefine((items, context) => {
      const ids = new Set<number>();
      for (const item of items) {
        if (ids.has(item.productId)) {
          context.addIssue({
            code: "custom",
            message: "Each product must appear once; use amount for quantity",
          });
        }
        ids.add(item.productId);
      }
    }),
});

export const purchaseReceiptSchema = z.object({
  success: z.boolean(),
  transaction: z.object({
    transactionId: z.string(),
    orderIds: z.array(z.number()),
    date: z.date(),
    items: z.array(
      z.object({
        product: z.object({
          id: z.number(),
          name: z.string(),
          title: z.string(),
          price: z.string(),
        }),
        amount: z.number(),
        totalPrice: z.string(),
      }),
    ),
    member: z.object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      cardNumber: z.number(),
    }),
    totalPrice: z.string(),
    previousBalance: z.string(),
    newBalance: z.string(),
  }),
});

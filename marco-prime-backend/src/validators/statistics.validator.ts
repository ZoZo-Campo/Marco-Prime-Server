import { z } from "zod";

const adminCardNumberSchema = z.number().int().positive().safe();
const moneySchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Price must have at most two decimals")
  .refine((value) => Number(value) <= 9_999_999.99, {
    message: "Price is too large",
  });

export const statisticsQuerySchema = z
  .object({
    adminCardNumber: adminCardNumberSchema,
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .superRefine(({ from, to }, context) => {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    if (toTime <= fromTime) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date must be after the start date",
      });
    }
    if (toTime - fromTime > 366 * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The statistics period cannot exceed 366 days",
      });
    }
  });

export const statisticsCostQuerySchema = z.object({
  adminCardNumber: adminCardNumberSchema,
});

export const statisticsCostUpdateSchema = z.object({
  adminCardNumber: adminCardNumberSchema,
  costs: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        costPrice: moneySchema,
      }),
    )
    .max(500)
    .refine(
      (costs) => new Set(costs.map((cost) => cost.productId)).size === costs.length,
      { message: "Product identifiers must be unique" },
    ),
});

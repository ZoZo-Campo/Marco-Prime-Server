import { z } from "zod";

export const orderSchema = z.object({
  id: z.number(),
  product: z
    .object({
      id: z.number(),
      name: z.string(),
    })
    .nullable(),
  member: z
    .object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      balance: z.string(),
    })
    .nullable(),
  price: z.string(),
  amount: z.number(),
  date: z.date(),
});

export const paginationQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((val) => val >= 1 && val <= 100_000, {
      message: "Page must be between 1 and 100000",
    })
    .optional()
    .default(1),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((val) => val >= 1 && val <= 100, {
      message: "Limit must be between 1 and 100",
    })
    .optional()
    .default(20),
});

export const historyQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).superRefine(({ from, to }, context) => {
  if (from && to && new Date(to) <= new Date(from)) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "The end date must be after the start date",
    });
  }
});

export const paginatedResponseSchema = z.object({
  data: z.array(orderSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

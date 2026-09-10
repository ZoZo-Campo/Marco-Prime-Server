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

export const paginatedResponseSchema = z.object({
  data: z.array(orderSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

import z from "zod";

export const productTypeParamSchema = z.object({
  product_type_id: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((value) => value >= 1, { message: "Product type must be >= 1" }),
});

export const productPaginationQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((value) => value >= 1, { message: "Page must be >= 1" })
    .optional()
    .default(1),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((value) => value >= 1 && value <= 100, {
      message: "Limit must be between 1 and 100",
    })
    .optional()
    .default(20),
});

export const productSchema = z.object({
  id: z.number(),
  title: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  price: z.string(),
  productTypeId: z.number(),
  available: z.boolean(),
});

export const catalogSelectionRequestSchema = z.object({
  adminCardNumber: z.number().int().positive(),
  productIds: z
    .array(z.number().int().positive())
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Product identifiers must be unique",
    }),
});

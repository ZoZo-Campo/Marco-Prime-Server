import { z } from "zod";

export const memberSchema = z.object({
  id: z.number(),
  lastName: z.string(),
  firstName: z.string(),
  cardNumber: z.number().nullable(),
  email: z.email(),
  phone: z.string().nullable(),
  balance: z.string(),
  admin: z.boolean(),
  contributor: z.boolean(),
  birthDate: z.date().nullable(),
  sector: z.string().nullable(),
  createdAt: z.date(),
  class: z.number().nullable(),
});

export const cardNumberParamSchema = z.object({
  card_number: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value > 0, {
      message: "Card number must be a positive safe integer",
    }),
});

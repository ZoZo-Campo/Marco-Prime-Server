import { z } from "zod";

const adminCardNumber = z.number().int().positive().safe();
const cardNumber = z.number().int().positive().safe();

export const adminReadSchema = z.object({ adminCardNumber });

export const adminMemberSearchSchema = adminReadSchema.extend({
  query: z.string().trim().max(80).default(""),
  promotion: z.number().int().min(2000).max(2100).optional(),
}).refine(({ query, promotion }) => query.length >= 2 || promotion !== undefined, {
  message: "Saisir deux lettres ou choisir une promotion",
});

export const adminMemberCreateSchema = adminReadSchema.extend({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.email().max(255),
  promotion: z.number().int().min(2000).max(2100).nullable(),
  cardNumber: cardNumber.nullable(),
});

export const adminBadgeSchema = adminReadSchema.extend({
  memberId: z.number().int().positive().safe(),
  expectedCardNumber: cardNumber.nullable(),
  newCardNumber: cardNumber,
});

export const adminProductCreateSchema = adminReadSchema.extend({
  name: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(25),
  price: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/).refine((value) => Number(value) > 0),
  productTypeId: z.number().int().positive().safe(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const adminProductAvailabilitySchema = adminReadSchema.extend({
  productId: z.number().int().positive().safe(),
  expectedAvailable: z.boolean(),
  available: z.boolean(),
});

const productPrice = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/).refine((value) => Number(value) > 0);

export const adminProductPriceSchema = adminReadSchema.extend({
  productId: z.number().int().positive().safe(),
  expectedPrice: productPrice,
  price: productPrice,
});

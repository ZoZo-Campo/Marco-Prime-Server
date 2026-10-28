import { z } from "zod";

const adminCardNumber = z.number().int().positive().safe();

export const envAdminSchema = z.object({
  adminCardNumber,
});

export const envValidateSchema = envAdminSchema.extend({
  content: z.string().min(1).max(20_000),
});

export const envImportSchema = envValidateSchema.extend({
  restart: z.boolean().default(true),
});

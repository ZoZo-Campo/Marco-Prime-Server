import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .max(128, "Le mot de passe est trop long");

export const configPasswordUnlockSchema = z.object({
  password: passwordSchema,
  // Optionnel pour conserver le déverrouillage par mot de passe seul, mais
  // s'il est fourni il doit correspondre à la carte associée au mot de passe.
  adminCardNumber: z.number().int().positive().safe().optional(),
});

export const configPasswordSetupSchema = z.object({
  adminCardNumber: z.number().int().positive().safe(),
  password: passwordSchema,
});

export const configPasswordDisableSchema = z.object({
  adminCardNumber: z.number().int().positive().safe(),
});

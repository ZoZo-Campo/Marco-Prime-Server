import z from "zod";
import { moneyStringSchema } from "./money.schema";

// Schema pour un membre (réponse API)
export const memberSchema = z.object({
  id: z.coerce.number().int().positive(),
  lastName: z.string(),
  firstName: z.string(),
  cardNumber: z.coerce.number().int().positive().safe(),
  balance: moneyStringSchema,
  admin: z.coerce.boolean(),
  contributor: z.coerce.boolean().default(true),
  class: z.number().nullable().optional(),
  isBirthday: z.boolean().optional().default(false),
});

export const memberListSchema = z.array(memberSchema);

// Type exporté pour utilisation dans les composants
export type MemberSchema = z.infer<typeof memberSchema>;

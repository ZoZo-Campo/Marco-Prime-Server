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
});

// Type exporté pour utilisation dans les composants
export type MemberSchema = z.infer<typeof memberSchema>;

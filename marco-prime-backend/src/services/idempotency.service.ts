import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../config/database.js";
import { idempotencyKeys } from "../db/schema.js";

export type IdempotencyScope = "purchase" | "recharge";

export class IdempotencyConflictError extends Error {
  constructor() {
    super("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    this.name = "IdempotencyConflictError";
  }
}

/**
 * Empreinte stable de la requête : même transaction + même panier = même
 * empreinte. Un identifiant réutilisé avec un autre contenu est un conflit,
 * pas un rejeu.
 */
export function hashRequest(
  scope: IdempotencyScope,
  payload: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ scope, payload }))
    .digest("hex");
}

export async function findIdempotentResponse(
  transactionId: string,
  scope: IdempotencyScope,
  requestHash: string,
): Promise<unknown | null> {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.transactionId, transactionId))
    .limit(1);
  if (!row) return null;
  if (row.scope !== scope || row.requestHash !== requestHash) {
    throw new IdempotencyConflictError();
  }
  try {
    return JSON.parse(row.responseJson) as unknown;
  } catch {
    // Une réponse illisible ne doit jamais autoriser un second débit.
    throw new Error("IDEMPOTENCY_RESPONSE_CORRUPT");
  }
}

/**
 * Met à jour la réponse mémorisée après une annotation non financière
 * (mode de paiement local, par exemple). Une erreur ici ne remet pas en
 * cause l'opération déjà validée.
 */
export async function updateIdempotentResponse(
  transactionId: string,
  scope: IdempotencyScope,
  response: unknown,
) {
  await db
    .update(idempotencyKeys)
    .set({ responseJson: JSON.stringify(response) })
    .where(
      and(
        eq(idempotencyKeys.transactionId, transactionId),
        eq(idempotencyKeys.scope, scope),
      ),
    );
}

/**
 * Purge les clés anciennes. La durée est volontairement supérieure à toute
 * fenêtre de rejeu plausible (coupure réseau, redémarrage, restauration).
 */
export async function cleanupIdempotencyKeys(maxAgeDays = 30) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, cutoff));
}

import { DEPLOYMENT_MODE, apiHeaders, apiUrl } from "../config/api";
import { memberSchema, type MemberSchema } from "../schemas/member.schema";
import { setAdminSession } from "./admin-session";
import { configPasswordConfigured } from "./config-auth-status";

/**
 * Ouvre une session administrateur signée à partir du mot de passe de
 * configuration. La carte est facultative : si elle est fournie, le serveur
 * vérifie qu'elle correspond bien à celle associée au mot de passe.
 *
 * Le jeton retourné n'est jamais le jeton d'API : c'est une signature courte
 * (30 minutes) dérivée côté serveur.
 */
export async function unlockAdminSession(
  password: string,
  cardNumber?: number,
): Promise<MemberSchema> {
  const response = await fetch(apiUrl("config-auth/unlock"), {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      password,
      ...(cardNumber !== undefined ? { adminCardNumber: cardNumber } : {}),
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
    member?: unknown;
    adminToken?: unknown;
    expiresAt?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(
      body?.message ?? body?.error ?? `Erreur HTTP ${response.status}`,
    );
  }

  const parsed = memberSchema.safeParse(body?.member);
  if (!parsed.success) {
    throw new Error("Réponse administrateur invalide.");
  }

  if (
    typeof body?.adminToken === "string" &&
    (typeof body.expiresAt === "string" ||
      typeof body.expiresAt === "number")
  ) {
    setAdminSession(
      body.adminToken,
      body.expiresAt,
      parsed.data.cardNumber,
      parsed.data.firstName,
      parsed.data.lastName,
    );
  } else if (DEPLOYMENT_MODE === "server") {
    // Le mot de passe est bon, mais le serveur ne peut pas signer de session
    // (API_TOKEN absent). Ne pas laisser croire que l'action est autorisée.
    throw new Error(
      "Session administrateur indisponible. Vérifiez API_TOKEN sur le serveur.",
    );
  }

  configPasswordConfigured.value = true;
  return parsed.data;
}

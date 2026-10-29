import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminSessionRequired } from "../config/deployment.js";
import { auditEvent } from "../config/logger.js";
import { configAuthService } from "../services/config-auth.service.js";
import { verifyAdminSession } from "../services/admin-session.service.js";

/**
 * Toutes les routes capables de modifier de l'argent, des membres, des prix
 * ou de la configuration exigent une session administrateur signée lorsque
 * l'application est déployée sur le serveur.
 *
 * Le numéro de carte seul ne suffit plus : il est présent dans les réponses
 * de recherche et peut être énuméré. La session est délivrée après
 * vérification du mot de passe de configuration.
 */
const SENSITIVE_PREFIXES = [
  "/api/v1/admin/",
  "/api/v1/statistics",
  "/api/v1/accounting",
  "/api/v1/order-corrections",
  "/api/v1/recharge-corrections",
  "/api/v1/system/env",
] as const;

const SENSITIVE_EXACT = [
  "/api/v1/recharge-method",
  "/api/v1/config-auth/setup",
  "/api/v1/config-auth/password",
  "/api/v1/config-auth/disable",
] as const;

function isSensitiveRequest(method: string, path: string) {
  if (SENSITIVE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  if (SENSITIVE_EXACT.includes(path as (typeof SENSITIVE_EXACT)[number])) {
    return true;
  }
  // Le catalogue visible en caisse est public ; le modifier ne l'est pas.
  return path === "/api/v1/catalog-selection" && method === "PUT";
}

async function readAdminCardNumber(c: Context): Promise<number | null> {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    // clone() permet au validateur Zod de relire le corps ensuite.
    const body = (await c.req.raw.clone().json()) as unknown;
    if (
      typeof body !== "object" ||
      body === null ||
      !("adminCardNumber" in body)
    ) {
      return null;
    }
    const value = (body as { adminCardNumber?: unknown }).adminCardNumber;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export const adminSessionMiddleware: MiddlewareHandler = async (c, next) => {
  if (!adminSessionRequired()) return next();
  if (!isSensitiveRequest(c.req.method, c.req.path)) return next();

  const status = await configAuthService.status();
  if (!status.configured) {
    // Amorçage : aucun mot de passe n'existe encore. On laisse la première
    // configuration se faire par carte admin, puis le middleware devient
    // strict dès que le mot de passe est enregistré.
    auditEvent("admin.bootstrap_legacy_access", { path: c.req.path });
    return next();
  }

  const session = verifyAdminSession(c.req.header("x-admin-token"));
  if (!session) {
    auditEvent("admin.access_denied", {
      path: c.req.path,
      reason: "missing_or_invalid_session",
    });
    throw new HTTPException(401, {
      message:
        "Session administrateur requise : reconnectez-vous avec le mot de passe de configuration",
    });
  }

  const bodyCardNumber = await readAdminCardNumber(c);
  if (bodyCardNumber !== null && bodyCardNumber !== session.cardNumber) {
    auditEvent("admin.access_denied", {
      path: c.req.path,
      reason: "card_mismatch",
    });
    throw new HTTPException(403, {
      message:
        "La session administrateur ne correspond pas à la carte présentée",
    });
  }

  c.set("adminSession", session);
  await next();
};

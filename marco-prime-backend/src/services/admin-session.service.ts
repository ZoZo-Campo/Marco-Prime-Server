import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session administrateur signée, valable 30 minutes.
 *
 * Le numéro de carte sert à identifier l'administrateur, jamais à prouver
 * son identité : il est public et énumérable. La preuve est le mot de passe
 * de configuration, vérifié par `configAuthService`, puis matérialisée par ce
 * jeton signé que le client renvoie dans `X-Admin-Token`.
 *
 * Le secret de signature est le `API_TOKEN` du serveur. Il n'est jamais
 * envoyé au navigateur : Caddy l'injecte vers l'API. Changer `API_TOKEN`
 * invalide donc toutes les sessions en cours.
 */

const SESSION_TTL_MS = 30 * 60 * 1000;
const TOKEN_VERSION = 1;

export interface AdminSession {
  version: 1;
  memberId: number;
  cardNumber: number;
  expiresAt: number;
}

export interface IssuedAdminSession {
  token: string;
  expiresAt: number;
}

function signingSecret(): Buffer | null {
  const apiToken = process.env.API_TOKEN;
  if (!apiToken) return null;
  // Séparation de clé : le secret de session n'est pas directement le jeton
  // d'API, même s'il en dérive.
  return createHmac("sha256", apiToken)
    .update("marco-prime/admin-session/v1")
    .digest();
}

function sign(encodedPayload: string, secret: Buffer) {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function createAdminSession(member: {
  id: number;
  cardNumber: number;
}): IssuedAdminSession | null {
  const secret = signingSecret();
  if (!secret) return null;

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload: AdminSession = {
    version: TOKEN_VERSION,
    memberId: member.id,
    cardNumber: member.cardNumber,
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return {
    token: `${encodedPayload}.${sign(encodedPayload, secret)}`,
    expiresAt,
  };
}

export function verifyAdminSession(
  token: string | undefined | null,
): AdminSession | null {
  if (!token) return null;
  const secret = signingSecret();
  if (!secret) return null;

  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const encodedPayload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  const expectedSignature = sign(encodedPayload, secret);

  const provided = Buffer.from(providedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("version" in payload) ||
    !("memberId" in payload) ||
    !("cardNumber" in payload) ||
    !("expiresAt" in payload)
  ) {
    return null;
  }

  const candidate = payload as Partial<AdminSession>;
  if (
    candidate.version !== TOKEN_VERSION ||
    typeof candidate.memberId !== "number" ||
    !Number.isSafeInteger(candidate.memberId) ||
    candidate.memberId <= 0 ||
    typeof candidate.cardNumber !== "number" ||
    !Number.isSafeInteger(candidate.cardNumber) ||
    candidate.cardNumber <= 0 ||
    typeof candidate.expiresAt !== "number" ||
    !Number.isFinite(candidate.expiresAt) ||
    candidate.expiresAt <= Date.now()
  ) {
    return null;
  }

  return candidate as AdminSession;
}

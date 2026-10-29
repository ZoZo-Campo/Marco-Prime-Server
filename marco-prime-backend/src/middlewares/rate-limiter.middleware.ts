import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { deploymentMode } from "../config/deployment.js";

function clientAddress(c: Context): string {
  // En mode serveur, `app` n'est jamais publié : seul Caddy peut l'atteindre
  // et il réécrit X-Real-IP avec l'adresse réelle de la connexion. Dans
  // Docker, la socket vue par l'application est celle du conteneur Caddy
  // (adresse de bridge), pas 127.0.0.1 : on ne peut donc pas se fier à un
  // test de loopback.
  if (deploymentMode() === "server") {
    const realIp = c.req.header("x-real-ip")?.trim();
    if (realIp) return realIp;
  }

  // En accès direct (tablette, développement), l'adresse de la socket est la
  // seule fiable : un en-tête fourni par le client est ignoré.
  let remote: string | undefined;
  try {
    remote = getConnInfo(c).remote.address;
  } catch {
    remote = undefined;
  }
  if (remote) return remote;

  // Dernier recours : contexte sans socket (tests, adaptateurs alternatifs).
  return c.req.header("x-real-ip")?.trim() || "unknown";
}

function createLimiter(limit: number): MiddlewareHandler {
  const instance = rateLimiter({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    keyGenerator: clientAddress,
  });

  return async (c, next) => {
    if (process.env.NODE_ENV === "test") return next();
    return instance(c, next);
  };
}

// Limite générale : une caisse et quelques appareils derrière la même IP.
export const limiter = createLimiter(300);

// Routes d'authentification et d'administration : plus strictes, pour rendre
// les essais de mots de passe et de cartes beaucoup plus coûteux.
export const sensitiveLimiter = createLimiter(30);

import { adminSessionHeaders } from "../utils/admin-session";

type RuntimeConfig = {
  apiUrl?: string;
  deployment?: "server" | "local";
  /**
   * Vrai lorsque le reverse proxy (Caddy) ajoute lui-même le jeton d'API.
   * Faux ou absent pour un kiosque statique, qui doit alors envoyer le jeton
   * figé au build via `VITE_API_TOKEN`.
   */
  apiTokenInjected?: boolean;
};

/**
 * Configuration injectée par le serveur dans `/runtime-config.js`.
 * Elle permet de changer l'URL sans reconstruire le frontend.
 *
 * Le jeton d'API n'est volontairement plus exposé : en déploiement serveur,
 * Caddy l'ajoute lui-même vers l'API. `VITE_API_TOKEN` ne sert qu'au
 * développement local ou au mode kiosque séparé, jamais à l'image serveur.
 */
const runtimeConfig: RuntimeConfig =
  (globalThis as { MARCO_CONFIG?: RuntimeConfig }).MARCO_CONFIG ?? {};

const configuredApiUrl =
  runtimeConfig.apiUrl || import.meta.env.VITE_API_URL || "/api/v1";

export const API_BASE_URL = configuredApiUrl.replace(/\/$/, "");

/** `server` : déployé sur le serveur de l'école ; `local` : tablette ou dev. */
export const DEPLOYMENT_MODE = runtimeConfig.deployment ?? "local";

/** Vrai si Caddy ajoute le jeton : le navigateur ne doit pas l'envoyer. */
export const API_TOKEN_INJECTED = runtimeConfig.apiTokenInjected === true;

/** En mode serveur, `.env` est géré sur l'hôte et non depuis l'interface. */
export const ENV_EDITABLE = DEPLOYMENT_MODE !== "server";

export function apiUrl(path: string) {
  return `${API_BASE_URL}/${path.replace(/^\//, "")}`;
}

export function apiHeaders(headers: HeadersInit = {}) {
  // Le jeton de build ne sert qu'au kiosque séparé ou au développement. Quand
  // Caddy l'injecte, ne jamais l'envoyer depuis le navigateur, même si un
  // build a été fait avec VITE_API_TOKEN par erreur.
  const token = API_TOKEN_INJECTED
    ? undefined
    : import.meta.env.VITE_API_TOKEN;

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...adminSessionHeaders(),
    ...headers,
  };
}

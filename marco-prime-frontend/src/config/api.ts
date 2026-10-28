type RuntimeConfig = {
  apiUrl?: string;
  apiToken?: string;
  deployment?: "server" | "local";
};

/**
 * Configuration injectée par le serveur dans `/runtime-config.js`.
 * Elle permet de changer l'URL ou le jeton sans reconstruire le frontend.
 * En l'absence de ce fichier (build statique séparé), on retombe sur les
 * variables VITE_* figées à la compilation.
 */
const runtimeConfig: RuntimeConfig =
  (globalThis as { MARCO_CONFIG?: RuntimeConfig }).MARCO_CONFIG ?? {};

const configuredApiUrl =
  runtimeConfig.apiUrl || import.meta.env.VITE_API_URL || "/api/v1";

export const API_BASE_URL = configuredApiUrl.replace(/\/$/, "");

/** `server` : déployé sur le serveur de l'école ; `local` : tablette ou dev. */
export const DEPLOYMENT_MODE = runtimeConfig.deployment ?? "local";

/** En mode serveur, `.env` est géré sur l'hôte et non depuis l'interface. */
export const ENV_EDITABLE = DEPLOYMENT_MODE !== "server";

export function apiUrl(path: string) {
  return `${API_BASE_URL}/${path.replace(/^\//, "")}`;
}

export function apiHeaders(headers: HeadersInit = {}) {
  const token = runtimeConfig.apiToken || import.meta.env.VITE_API_TOKEN;

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
}

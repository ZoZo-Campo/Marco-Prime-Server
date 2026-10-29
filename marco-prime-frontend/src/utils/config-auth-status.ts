import { signal } from "@preact/signals";
import { apiHeaders, apiUrl } from "../config/api";

/**
 * Indique si un mot de passe de configuration existe.
 *
 * `null` = état inconnu (chargement ou serveur indisponible). Dans ce cas,
 * l'interface conserve le comportement historique par carte ; le serveur
 * reste l'autorité et refusera les actions sensibles si un mot de passe est
 * réellement configuré.
 */
export const configPasswordConfigured = signal<boolean | null>(null);

let inFlight: Promise<void> | null = null;

export function refreshConfigAuthStatus() {
  if (inFlight) return inFlight;
  inFlight = fetch(apiUrl("config-auth/status"), {
    cache: "no-store",
    headers: apiHeaders(),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { configured?: boolean };
      configPasswordConfigured.value = body.configured === true;
    })
    .catch(() => {
      configPasswordConfigured.value = null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

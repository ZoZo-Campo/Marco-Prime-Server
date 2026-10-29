import { DEPLOYMENT_MODE } from "../config/api";
import { adminSession } from "./admin-session";
import { configPasswordConfigured } from "./config-auth-status";

/**
 * Une session signée n'est exigée qu'en déploiement serveur, et seulement
 * après qu'un mot de passe de configuration a été défini. En mode tablette
 * ou en développement, le parcours carte historique reste utilisable.
 */
export function adminSessionRequired() {
  return DEPLOYMENT_MODE === "server" && configPasswordConfigured.value === true;
}

export function hasValidAdminSession(cardNumber: number) {
  const session = adminSession.value;
  return (
    session !== null &&
    session.cardNumber === cardNumber &&
    session.expiresAt > Date.now()
  );
}

/**
 * Vrai si l'administrateur identifié par cette carte peut agir maintenant.
 * En mode serveur avec mot de passe, il faut une session ouverte pour cette
 * carte précise : une session appartenant à un autre administrateur ne doit
 * pas autoriser une action à sa place.
 */
export function isAdminAccessGranted(cardNumber: number) {
  return !adminSessionRequired() || hasValidAdminSession(cardNumber);
}

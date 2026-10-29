export type DeploymentMode = "server" | "local";

/**
 * `server` : l'API et le frontend sont servis par le serveur de l'école
 * (Docker + Caddy). `local` : tablette Termux ou poste de développement, où
 * le fichier `.env` peut être modifié depuis l'interface.
 */
export function deploymentMode(): DeploymentMode {
  return process.env.MARCO_DEPLOYMENT === "server" ? "server" : "local";
}

/** En mode serveur, `.env.server` est géré sur l'hôte, jamais dans le conteneur. */
export function envFileEditable() {
  return deploymentMode() === "local";
}

/**
 * En mode serveur, une session administrateur signée est exigée sur les
 * routes sensibles. `MARCO_ADMIN_AUTH=required` permet d'appliquer la même
 * règle en local pour les tests, sans changer le mode de déploiement.
 *
 * La session est volontairement liée à un mot de passe de configuration :
 * un numéro de carte n'est pas un secret et ne doit jamais suffire.
 */
export function adminSessionRequired() {
  return (
    deploymentMode() === "server" ||
    process.env.MARCO_ADMIN_AUTH === "required"
  );
}

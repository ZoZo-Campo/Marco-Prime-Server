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

import { render } from "preact";
import { Providers } from "./components/providers.tsx";
import { Router } from "./router.tsx";
import { refreshConfigAuthStatus } from "./utils/config-auth-status.ts";
import "./styles/index.css";

render(
  <Providers>
    <Router />
  </Providers>,
  document.getElementById("app")!,
);

// Enregistrement du service worker depuis le bundle : évite un script inline
// et permet une Content-Security-Policy stricte (script-src 'self').
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// L'interface a besoin de savoir si les actions sensibles exigent une
// session administrateur (mot de passe configuré) ou si le parcours carte
// historique suffit encore (premier démarrage).
void refreshConfigAuthStatus();

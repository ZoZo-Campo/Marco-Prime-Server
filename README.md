# Marco Prime Server

Version préparée pour séparer le backend et le kiosque Marco Prime.

- Le serveur de l’école conserve les identifiants Fouaille et expose l’API en HTTPS avec Caddy.
- Le Raspberry exécute uniquement le frontend statique et appelle cette API distante.
- Aucun identifiant MySQL n’est installé sur le Raspberry.

Les valeurs à demander et à remplacer sont détaillées dans [CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md).

## Serveur

```bash
./server check
nano .env.server
./server check
./server start
```

Le DNS doit pointer vers le serveur et les ports 80/443 doivent être accessibles pour que Caddy obtienne automatiquement le certificat HTTPS.

## Raspberry / frontend

```bash
./frontend check
nano .env.frontend
./frontend check
./frontend start
```

Ouvrir ensuite `http://127.0.0.1:3001` dans Chromium.

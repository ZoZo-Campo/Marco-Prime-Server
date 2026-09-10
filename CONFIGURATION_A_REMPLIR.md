# Valeurs à obtenir avant le déploiement

Toutes les valeurs sensibles sont regroupées dans deux fichiers ignorés par Git.

## Sur le serveur de l’école : `.env.server`

Créer le fichier avec `cp .env.server.example .env.server`, puis renseigner :

- `MARCO_API_DOMAIN` : sous-domaine public, par exemple `marco-api.its-tps.fr` ;
- `DATABASE_URL` : compte MySQL dédié à Marco, adresse, port et nom exact de la base ;
- `API_TOKEN` : jeton aléatoire généré avec `openssl rand -hex 32` ;
- `FRONTEND_URL` : conserver les adresses locales du kiosque, et ajouter toute autre origine autorisée si nécessaire.

À demander à l’administratrice :

- création du sous-domaine DNS vers l’adresse du serveur ;
- ouverture entrante des ports TCP 80 et 443, et éventuellement UDP 443 ;
- autorisation réseau du serveur vers MySQL Fouaille ;
- compte MySQL dédié avec uniquement les permissions nécessaires ;
- politique de sauvegarde du volume Docker et des journaux.

## Sur chaque Raspberry : `.env.frontend`

Créer le fichier avec `cp .env.frontend.example .env.frontend`, puis renseigner :

- `MARCO_REMOTE_API_URL=https://<domaine>/api/v1` ;
- `MARCO_API_TOKEN` avec exactement le même jeton que le serveur.

Le Raspberry ne reçoit jamais `DATABASE_URL`.

## Sécurité importante

Le jeton du frontend limite les requêtes accidentelles mais reste extractible d’un navigateur. Le serveur doit aussi être protégé par le pare-feu de l’école, une liste d’adresses IP ou un VPN. Ne publiez jamais `.env.server` ou `.env.frontend` dans Git.


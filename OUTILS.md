# Outils utilisés et où les régler

Inventaire technique de la version serveur : à quoi sert chaque outil, où il est
configuré et comment intervenir sans casser le reste.

---

## 1. Vue d'ensemble

| Outil | Rôle | Où le régler |
|-------|------|--------------|
| **Docker** | Exécute les conteneurs | `compose.server.yml`, `Dockerfile.server` |
| **Docker Compose** | Orchestre app + HTTPS | `compose.server.yml`, `server` |
| **Caddy** | HTTPS automatique, reverse proxy, en-têtes | `Caddyfile`, `MARCO_TLS_DIRECTIVE` |
| **Node.js 24** | Exécute l'API | `Dockerfile.server` |
| **pnpm** | Gestion des dépendances, builds | `pnpm-lock.yaml`, `package.json` |
| **Hono** | Framework HTTP de l'API | `marco-prime-backend/src/index.ts`, `config/router.ts` |
| **Drizzle ORM** | Accès typé à MySQL | `src/db/schema.ts`, `drizzle.config.ts` |
| **mysql2** | Pilote MySQL | `src/config/database.ts` |
| **Zod** | Validation des entrées et des réponses | `src/validators/`, `src/schemas/` |
| **Vitest** | Tests automatisés | `vitest.config.ts`, `tests/` |
| **Preact** | Interface utilisateur | `marco-prime-frontend/src/` |
| **Vite** | Build du frontend | `vite.config.ts` |
| **Tailwind CSS 4** | Styles et responsive | `src/styles/`, classes utilitaires |
| **PWA** | Installation sur téléphone/tablette | `public/manifest.json`, `public/sw.js` |
| **Nginx** | Sert le frontend du kiosque séparé | `nginx.frontend.conf` |
| **Git / GitHub** | Versionnement et déploiement | branche `main` |
| **ufw** | Pare-feu local du serveur | `ufw` sur l'hôte |

---

## 2. Docker et Docker Compose

### Fichiers

| Fichier | Rôle |
|---------|------|
| `Dockerfile.server` | Construit **une** image : API compilée + frontend compilé |
| `compose.server.yml` | Deux services : `app` (interne) et `https` (exposé) |
| `Dockerfile.frontend` | Image Nginx pour un kiosque séparé |
| `compose.frontend.yml` | Kiosque séparé uniquement |
| `.dockerignore` | Exclut `node_modules`, `.env*`, `data`, tests |

### Le service `data-permissions`

Il s'exécute une fois au démarrage, en root, uniquement pour donner au
propriétaire du volume (`uid 1000`, utilisateur `node`) le droit d'écrire dans
`/app/data`. Il n'a aucune autre capacité (`cap_add: [CHOWN]`) et ne tourne pas
en permanence.

Conséquence : si vous changez l'utilisateur du conteneur, mettez aussi à jour ce
service, sinon l'application ne pourra plus enregistrer la compta.

### Durcissement commun

```yaml
read_only: true                 # système de fichiers non modifiable
cap_drop: [ALL]                 # aucune capacité Linux
security_opt: [no-new-privileges:true]
init: true
tmpfs: [/tmp:rw,noexec,nosuid,size=64m]
```

L'application n'écrit que dans `/app/data` (volume) et `/tmp` (mémoire).

### Réseau

- `app` n'a **aucun** `ports:` : il n'est joignable que par Caddy.
- `https` publie `80`, `443` et `443/udp`.
- Les deux services partagent le réseau Compose par défaut ; Caddy joint
  `app:3000`.

### Commandes utiles

```bash
docker compose -f compose.server.yml --env-file .env.server ps
docker compose -f compose.server.yml --env-file .env.server logs -f app
docker compose -f compose.server.yml --env-file .env.server exec app sh
docker stats
docker system df
```

Nettoyage prudent (ne supprime pas les volumes nommés) :

```bash
docker image prune -f
docker builder prune -f
```

---

## 3. Caddy (HTTPS)

### Fichier `Caddyfile`

```caddyfile
{$MARCO_API_DOMAIN} {
  encode zstd gzip
  header { … }
  {$MARCO_TLS_DIRECTIVE:tls internal}
  reverse_proxy app:3000
}
```

- `{$VAR}` est remplacé par la variable d'environnement du conteneur.
- `{$VAR:défaut}` fournit une valeur par défaut.
- `tls internal` crée une autorité locale.
- `tls adresse@exemple.fr` active Let's Encrypt avec ce contact.
- `tls /chemin/cert.pem /chemin/key.pem` utilise un certificat fourni.

La variable contient la **ligne complète** (le mot `tls` inclus). C'est ce qui
permet de valider les trois formes sans laisser de directive vide, que Caddy
refuse.

### En-têtes ajoutés

| En-tête | Effet |
|---------|-------|
| `Strict-Transport-Security` | Force HTTPS pendant un an |
| `X-Content-Type-Options: nosniff` | Empêche la devinette de type MIME |
| `X-Frame-Options: DENY` | Empêche l'intégration dans une iframe |
| `Referrer-Policy: no-referrer` | N'envoie pas l'URL aux sites externes |
| `Permissions-Policy` | Autorise la caméra (scan QR), bloque le reste |
| `-Server` | Masque la version du serveur |

### Certificats : où ils vivent

| Élément | Emplacement |
|---------|-------------|
| Données Caddy | volume `caddy_data` |
| Autorité locale | `/data/caddy/pki/authorities/local/root.crt` dans le volume |
| Certificat fourni | `./certs/` sur l'hôte, monté en `/certs:ro` |

Export de l'autorité locale :

```bash
./server cert
```

### Journaux

```bash
docker compose -f compose.server.yml logs https --tail=100
```

Messages importants :

| Message | Signification |
|---------|---------------|
| `certificate obtained successfully` | Certificat ACME obtenu |
| `serving initial configuration` | Démarrage normal |
| `challenge failed` | Let's Encrypt impossible (DNS/ports) |
| `dial tcp … connection refused` | `app` ne répond pas |

---

## 4. Node.js et pnpm

- **Node 24** dans l'image (`node:24-bookworm-slim`).
- **pnpm 11.25.0**, installé dans chaque étage du `Dockerfile.server`.
- Les dépendances sont verrouillées par `pnpm-lock.yaml` ; le build utilise
  `--frozen-lockfile` et échoue si le lockfile ne correspond pas au
  `package.json`.

Après une modification de dépendances :

```bash
cd marco-prime-backend && pnpm install
cd ../marco-prime-frontend && pnpm install
git add */pnpm-lock.yaml
```

Le runtime n'installe que les dépendances de production (`--prod --no-optional`)
et supprime le cache pnpm pour réduire la taille de l'image.

---

## 5. Hono (API)

### Point d'entrée `src/index.ts`

Ordre des middlewares (important) :

1. `onError` → réponses JSON uniformes ;
2. `logger` → journaux HTTP, numéros de carte masqués ;
3. `cors` → origines de `FRONTEND_URL` ;
4. `limiter` → 300 requêtes/minute/IP sur `/api/v1/*` ;
5. routes publiques : `/health`, `/ready`, `/doc`, `/ui`, `/runtime-config.js` ;
6. `authMiddleware` → jeton Bearer sur `/api/v1/*` ;
7. `router` → routes métier ;
8. en production : fichiers statiques du frontend.

### `GET /runtime-config.js`

Réponse générée à la volée :

```js
window.MARCO_CONFIG = {"apiUrl":"/api/v1","apiToken":"…","deployment":"server"};
```

- `Cache-Control: no-store` : le jeton n'est jamais mis en cache.
- Le frontend lit cette configuration avant de démarrer.
- Conséquence : changer `API_TOKEN` ne demande **pas** de reconstruire le
  frontend, seulement `./server rebuild` pour recréer le conteneur.

### Routes

Le détail est dans [marco-prime-backend/README.md](marco-prime-backend/README.md).
Documentation interactive : `https://<domaine>/ui` (protégée par le jeton).

---

## 6. Drizzle ORM et MySQL

### Fichiers

| Fichier | Rôle |
|---------|------|
| `src/db/schema.ts` | Description des tables Fouaille |
| `src/config/database.ts` | Pool MySQL, fuseau UTC |
| `drizzle.config.ts` | Configuration de `drizzle-kit` |
| `src/db/seed.ts` | Données de démonstration (base locale seulement) |
| `drizzle/` | Migrations générées |

### Le schéma est en lecture seule par défaut

Marco lit la base Fouaille et n'écrit que des lignes métier (ventes, soldes,
membres, produits). Ne lancez **jamais** `db:push` ou `db:seed` contre la
production `BdeData` : `seed` refuse déjà toute base non locale, mais
`db:push` n'a pas cette protection.

### Fuseau horaire

`src/config/database.ts` force MySQL et le driver en UTC. Le navigateur convertit
ensuite en `Europe/Paris`. C'est ce qui évite les décalages d'une heure entre
l'hiver et l'été dans l'historique et la compta.

---

## 7. Zod

Toutes les entrées passent par un validateur (`src/validators/`). Un corps
malformé reçoit un `400` explicite avant d'atteindre la base. Côté frontend,
les réponses sont validées par les schémas de `src/schemas/` : une réponse
inattendue devient une erreur visible, pas un plantage silencieux.

Pour ajouter une route :

1. créer le schéma Zod dans `validators/` ;
2. l'attacher avec `zValidator` dans `config/router.ts` ;
3. ajouter le schéma de réponse côté frontend dans `src/schemas/`.

---

## 8. Vitest et le lanceur de tests

### `tests/run-tests.ts`

`pnpm test` ne lance pas Vitest directement. Le lanceur :

1. charge `.env.test` (base locale `marco_prime_test`) ;
2. refuse toute base non locale ou dont le nom ne contient pas `test` ;
3. crée un dossier temporaire pour `MARCO_DATA_DIR` ;
4. désactive la synchronisation Fouaille ;
5. réinitialise la base de test avec `src/db/seed.ts` ;
6. lance Vitest ;
7. supprime le dossier temporaire.

Une tentative explicite contre la production est refusée :

```bash
DATABASE_URL='mysql://…@bde.its-tps.fr:3307/BdeData' pnpm test
# Tests refusés : DATABASE_URL doit viser une base locale dont le nom contient 'test'.
```

### Commandes

```bash
pnpm test            # une exécution, base reseedée
pnpm test:watch      # boucle de développement
pnpm test:coverage   # rapport de couverture
```

---

## 9. Frontend : Preact, Vite, Tailwind

| Élément | Emplacement |
|---------|-------------|
| Pages | `src/pages/` (`home`, `buy`, `recharge`, `history`, `config`, `ticket`) |
| Composants métier | `src/components/features/` |
| Composants d'interface | `src/components/ui/` |
| État global (signals) | `src/contexts/` |
| Appels API | `src/config/api.ts`, `src/hooks/use-api.ts` |
| Styles | `src/styles/index.css`, `theme.css` |
| Responsive | classes Tailwind (`sm:`, `md:`, `lg:`) |

### Configuration d'exécution

`src/config/api.ts` lit, dans cet ordre :

1. `window.MARCO_CONFIG` (mode serveur) ;
2. `VITE_API_URL` / `VITE_API_TOKEN` (build statique du kiosque) ;
3. `"/api/v1"` (développement).

### Responsive

| Largeur | Comportement |
|---------|--------------|
| < 768 px (téléphone) | Barre de navigation en icônes, achat empilé, reçu sous le catalogue, historique en cartes |
| 768–1023 px (tablette) | Icônes + libellés, catégories sur 3 colonnes |
| ≥ 1024 px (ordinateur/kiosque) | Catalogue à gauche, reçu à droite, historique en tableau, barre complète |

La zone de sécurité iOS est prise en compte (`env(safe-area-inset-bottom)`).

Sur téléphone, la caméra n'est **pas** pré-ouverte au chargement : le
navigateur ne demande l'autorisation qu'au moment où l'utilisateur touche
« Scanner un QR code ». Sur un kiosque où l'autorisation est déjà accordée, le
flux reste préchauffé pour un premier scan instantané.

### Build

```bash
cd marco-prime-frontend
pnpm build
# → dist/
```

Vite hache les noms de fichiers (`assets/index-XXXX.js`) : après un déploiement,
un simple rechargement suffit, pas besoin de vider le cache.

---

## 10. PWA

| Fichier | Rôle |
|---------|------|
| `public/manifest.json` | Nom, icônes, affichage plein écran |
| `public/sw.js` | Service worker minimal, ne met rien en cache |
| `public/icons/` | Icônes 192 et 512 px |

Le service worker vide est volontaire : il rend l'application installable sans
risquer de servir une ancienne version après une mise à jour.

Conditions d'installation : HTTPS de confiance + manifest + service worker. Sur
iPhone, l'installation passe par « Partager → Sur l'écran d'accueil ».

---

## 11. Nginx (kiosque séparé)

`nginx.frontend.conf` sert `dist/` avec :

- repli SPA (`try_files … /index.html`) ;
- cache long et immuable pour `/assets/` ;
- `no-store` pour `index.html` et `runtime-config.js` ;
- `/health` pour le healthcheck Docker.

Ce mode n'est utile que si le frontend tourne sur un autre appareil que l'API.

---

## 12. Git et GitHub

| Élément | Valeur |
|---------|--------|
| Dépôt | `https://github.com/ZoZo-Campo/Marco-Prime-Server` |
| Branche | `main` |
| Déploiement | `git pull` puis `./server rebuild` |

Fichiers ignorés (jamais commités) :

```
.env.server  .env.frontend  **/.env  **/data  backups/  certs/
```

Vérification avant commit :

```bash
git status --short
git diff --stat
```

---

## 13. Recettes courantes

### Changer le nom de domaine

1. `nano .env.server` → `MARCO_API_DOMAIN` et `FRONTEND_URL` ;
2. demander le DNS correspondant ;
3. `./server rebuild` ;
4. si `internal`, réexporter et réinstaller l'autorité (`./server cert`).

### Changer le jeton d'API

1. `openssl rand -hex 32` ;
2. `nano .env.server` → `API_TOKEN` ;
3. `./server rebuild`.

Le frontend récupère le nouveau jeton tout seul.

### Changer les identifiants MySQL

1. `nano .env.server` → `DATABASE_URL` ;
2. `./server rebuild` ;
3. vérifier `curl -k https://<domaine>/ready`.

### Modifier un produit ou un prix

Passer par l'interface : **Config → Produits Fouaille** ou **Catalogue → Prix**.
Ces écritures vont dans Fouaille et sont donc partagées avec les autres caisses.
Ne modifiez pas la base à la main.

### Ajouter une page

1. créer `src/pages/ma-page.tsx` ;
2. déclarer la route dans `src/router.tsx` ;
3. ajouter un bouton dans `src/components/layout/navbar.tsx` si nécessaire ;
4. `pnpm build`, puis `./server rebuild`.

### Ajouter une colonne en base

1. modifier `src/db/schema.ts` ;
2. `pnpm db:generate` (migration) ;
3. relire la migration SQL avant de l'appliquer ;
4. `pnpm db:migrate` sur une base de test d'abord.

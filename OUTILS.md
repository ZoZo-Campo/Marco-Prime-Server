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
| `compose.server.yml` | Trois services : `data-permissions` (préparation du volume), `app` (interne) et `https` (exposé) |
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

### Durcissement

Les trois services tournent en lecture seule et sans privilège
(`no-new-privileges`, capacités retirées). Deux exceptions explicites :
`CHOWN` pour `data-permissions` et `NET_BIND_SERVICE` pour Caddy. Réglages
propres à `app` :

```yaml
read_only: true                 # système de fichiers non modifiable
cap_drop: [ALL]                 # aucune capacité Linux
security_opt: [no-new-privileges:true]
init: true
tmpfs:
  - /tmp:rw,noexec,nosuid,size=64m
```

L'application n'écrit que dans `/app/data` (volume) et `/tmp` (mémoire).

Les trois services ont aussi des limites explicites, pour qu'un incident ne
consomme pas tout le serveur :

| Service | Mémoire | CPU | PIDs | Journal |
|---------|---------|-----|------|---------|
| `data-permissions` | 64 Mo | — | 32 | 10 Mo × 3 |
| `app` | 512 Mo | 1,0 | 256 | 10 Mo × 3 |
| `https` | 256 Mo | 0,5 | 128 | 10 Mo × 3 |

`app` a un `stop_grace_period` de 30 s : Docker laisse à l'application le temps
de terminer une écriture avant de l'arrêter. Caddy tourne aussi en lecture seule,
avec seulement `/tmp` en mémoire.

### Réseau

- `app` n'a **aucun** `ports:` : il n'est joignable que par Caddy.
- `https` publie `80`, `443` et `443/udp`.
- Les services partagent le réseau Compose par défaut ; Caddy joint
  `app:3000`.
- Caddy réécrit `X-Real-IP` avec l'adresse réelle et injecte
  `Authorization: Bearer $API_TOKEN` vers `app`. Un en-tête fourni par le
  navigateur est donc toujours remplacé.

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
  request_body { max_size 1MB }
  {$MARCO_TLS_DIRECTIVE:tls internal}
  @documentation path /ui /ui/* /doc
  respond @documentation 404
  reverse_proxy app:3000 {
    header_up X-Real-IP {remote_host}
    header_up Authorization "Bearer {$MARCO_API_TOKEN}"
  }
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
| `Content-Security-Policy` | N'autorise que les scripts, styles et connexions de l'application |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | Isole l'origine des autres sites |
| `-Server` | Masque la version du serveur |

La CSP interdit les scripts inline : le service worker est enregistré depuis
`src/main.tsx`, pas par un `<script>` dans `index.html`.

### Limite de corps et journal

- `request_body max_size 1MB` : un panier ou un rechargement tient largement en
  dessous. Le backend applique la même limite.
- `log` écrit chaque requête en JSON sur stdout, avec rotation Docker
  (10 Mo × 3). Les URLs peuvent contenir des numéros de carte : ces journaux
  restent sur le serveur et doivent être protégés comme des données
  personnelles.
- Les routes `/ui` et `/doc` répondent `404` : la documentation d'API n'est pas
  exposée en production.

### Jeton d'API

Caddy reçoit `MARCO_API_TOKEN` depuis `compose.server.yml`, lui-même alimenté par
`API_TOKEN`. Il l'ajoute à chaque requête vers `app`.

Conséquences :

- le navigateur ne reçoit jamais le jeton ;
- un `curl` sur l'URL publique aboutit sans en-tête `Authorization`, puisque
  Caddy l'ajoute ;
- l'API placée derrière Caddy n'est pas protégée par le jeton seul : la
  protection des actions sensibles est la session administrateur (mot de passe)
  et la limitation d'accès au réseau.

### Certificats : où ils vivent

| Élément | Emplacement |
|---------|-------------|
| Données Caddy | volume `caddy_data` |
| Autorité locale | `/data/caddy/pki/authorities/local/root.crt` dans le volume |
| Certificat fourni | `./certs/` sur l'hôte, monté en `/certs:ro` (ligne à décommenter dans `compose.server.yml`) |

Export de l'autorité locale :

```bash
./server cert
```

### Journaux

```bash
docker compose -f compose.server.yml --env-file .env.server logs https --tail=100
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

Le runtime n'installe que les dépendances de production, dans l'étage
`prod-deps` (`--prod --no-optional`). `pnpm` n'est pas copié dans l'image
finale : elle ne contient que Node, `node_modules` et les fichiers compilés.

`marco-prime-backend/pnpm-workspace.yaml` désactive l'installation automatique
des peers (`autoInstallPeers: false`). Sans cela, pnpm installe `@prisma/client`
et la CLI `prisma`, car `drizzle-orm` les déclare comme peers : ces paquets ne
servent pas au runtime, alourdissent l'image et ajoutent des dépendances
vulnérables. Si un outil a réellement besoin d'un peer, installez-le
explicitement.

Vérifier les vulnérabilités connues des dépendances de production :

```bash
cd marco-prime-backend && pnpm audit --prod
cd ../marco-prime-frontend && pnpm audit --prod
```

Au dernier contrôle, les deux commandes ne signalent aucune vulnérabilité
connue. La CI bloque au niveau `high` ; relancez l'audit complet après chaque
mise à jour et avant une publication.

---

## 5. Hono (API)

### Point d'entrée `src/index.ts`

Ordre des middlewares (important) :

1. `onError` → réponses JSON uniformes ;
2. `logger` → journaux HTTP, numéros de carte masqués ;
3. `cors` → origines de `FRONTEND_URL`, sans cookies (`credentials: false`) ;
4. `Cache-Control: no-store` sur toutes les réponses `/api/v1/*` ;
5. `bodyLimit` → 1 Mo maximum sur `/api/v1/*` ;
6. `limiter` → 300 requêtes/minute/IP sur `/api/v1/*` ;
7. `sensitiveLimiter` → 30 requêtes/minute/IP sur `unlock`, `setup`, `password` et `disable` ;
8. routes publiques : `/health`, `/ready`, `/doc`, `/ui`, `/runtime-config.js` ;
9. `authMiddleware` → jeton Bearer sur `/api/v1/*` ;
10. `adminSessionMiddleware` → session administrateur sur les routes sensibles ;
11. `router` → routes métier ;
12. en production : fichiers statiques du frontend.

### `GET /runtime-config.js`

Réponse générée à la volée :

```js
window.MARCO_CONFIG = {"apiUrl":"/api/v1","deployment":"server","apiTokenInjected":true};
```

- **Aucun jeton** dans cette réponse. Caddy ajoute l'en-tête `Authorization`
  côté serveur.
- `apiTokenInjected: true` indique au frontend de ne pas envoyer de jeton.
  Le kiosque statique (`nginx.frontend.conf`) renvoie `false` et continue
  d'utiliser le jeton figé au build (`VITE_API_TOKEN`).
- `Cache-Control: no-store` : la configuration n'est jamais mise en cache.
- Le frontend lit cette configuration avant de démarrer.
- Changer `API_TOKEN` ne demande **pas** de reconstruire le frontend, seulement
  `./server rebuild` pour recréer les conteneurs ; toutes les sessions
  administrateur en cours sont invalidées.

### Session administrateur

| Élément | Valeur |
|---------|--------|
| Obtention | `POST /api/v1/config-auth/unlock` avec le mot de passe (et éventuellement la carte) |
| En-tête | `X-Admin-Token` |
| Durée | 30 minutes |
| Signature | HMAC-SHA256 dérivé de `API_TOKEN` |
| Stockage navigateur | `sessionStorage` (disparaît à la fermeture de l'onglet) |
| Routes protégées | `/admin/*`, `/statistics*`, `/accounting*`, `/order-corrections*`, `/recharge-corrections*`, `/system/env*`, `POST /recharge-method`, `PUT /catalog-selection`, `POST /config-auth/setup|password|disable` |

Le middleware compare la carte du corps de la requête avec celle de la session :
une session ouverte pour un administrateur ne permet pas d'agir avec la carte
d'un autre. En l'absence de mot de passe configuré, le mode serveur autorise
encore l'amorçage par carte ; le premier `setup` exige alors
`X-Setup-Token: <API_TOKEN>`.

`MARCO_ADMIN_AUTH=required` permet d'appliquer la même exigence de session en
mode local, pour tester sans passer en déploiement serveur.

### Routes

Le détail est dans [marco-prime-backend/README.md](marco-prime-backend/README.md).

Documentation interactive : `https://<domaine>/ui` et schéma brut sur
`https://<domaine>/doc`. Le `Caddyfile` les fait répondre `404` en production :
elles ne sont utiles qu'en développement. Si vous les exposez un jour, gardez
en tête qu'elles décrivent toutes les routes, même sans données.

---

## 6. Drizzle ORM et MySQL

### Fichiers

| Fichier | Rôle |
|---------|------|
| `src/db/schema.ts` | Description des tables Fouaille |
| `src/config/database.ts` | Pool MySQL, fuseau UTC |
| `drizzle.config.ts` | Configuration de `drizzle-kit` |
| `src/db/seed.ts` | Données de démonstration (base locale seulement) |
| `src/db/migrate.ts` | Migration idempotente pour une base existante (`pnpm db:security`, `./server migrate`) |
| `drizzle/` | Migrations générées (`0000`, `0001_nosy_alice.sql`) |

### Le schéma est en lecture seule par défaut

Marco lit la base Fouaille et n'écrit que des lignes métier (ventes, soldes,
membres, produits). Ne lancez **jamais** `db:push` ou `db:seed` contre la
production `BdeData` : `seed` refuse déjà toute base non locale, mais
`db:push` n'a pas cette protection.

### Migration d'une base existante

`src/db/migrate.ts` est prévu pour `BdeData` déjà créée hors Drizzle. Il ne
rejoue pas l'historique complet ; il ajoute seulement ce qui manque :

| Objet | Rôle |
|-------|------|
| table `idempotency_keys` | réponse mémorisée d'un achat/rechargement, pour éviter un double débit |
| table `order_corrections` | garde unique anti-double-correction, même si le journal local disparaît |
| index unique `members.card_number` | empêche deux membres de partager un badge |
| index de lecture | `orders(date, member_id, product_id)`, `members(class)`, `products(product_type_id)` |

Il est idempotent et ne supprime aucune donnée. Il s'arrête si des badges sont
dupliqués ou si la base est vide. Utilisation :

```bash
# Sur une base de test ou une copie de BdeData
DATABASE_URL='mysql://…@127.0.0.1:3306/marco_prime_test' pnpm db:security

# Sur le serveur, avec confirmation
./server migrate
```

Droits nécessaires : `CREATE`, `ALTER`, `INDEX` (ou faire exécuter la commande
par le service informatique). La migration Drizzle `0001_nosy_alice.sql` est la
version « schéma complet » pour une base neuve ; `src/db/migrate.ts` est la
version tolérante pour une base existante.

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
DATABASE_URL='mysql://…@mysql.example.fr:3306/BdeData' pnpm test
# Tests refusés : DATABASE_URL doit viser une base locale dont le nom contient 'test'.
```

La base de test doit avoir le schéma **et** les tables de sécurité. Sur une base
neuve :

```bash
DATABASE_URL='mysql://…@127.0.0.1:3306/marco_prime_test' pnpm db:push
DATABASE_URL='mysql://…@127.0.0.1:3306/marco_prime_test' pnpm db:security
pnpm test
```

### Ce que couvrent les tests

| Fichier | Points clés |
|---------|-------------|
| `purchase.test.ts` | débit, solde insuffisant, idempotence persistée en base, concurrence |
| `recharge.test.ts` | plafond, carte admin, annulation unique même sans journal local |
| `order-correction.test.ts` | remboursement/remplacement, double correction refusée après perte du journal |
| `admin-session.test.ts` | session signée, carte différente, jeton invalide, bootstrap `X-Setup-Token` |
| `statistics`, `accounting`, `member`, `product`, `history`, `system` | routes métier et calculs |

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

1. `window.MARCO_CONFIG` (URL, mode et indicateur d'injection, **sans jeton**) ;
2. `VITE_API_URL` / `VITE_API_TOKEN` (build statique du kiosque séparé) ;
3. `"/api/v1"` (développement).

En mode serveur, `apiTokenInjected` vaut `true` : le navigateur n'envoie pas de
jeton d'API, Caddy l'ajoute. Le kiosque séparé renvoie `false` et envoie le
jeton figé au build. `apiHeaders()` ajoute en revanche `X-Admin-Token` quand
une session administrateur est ouverte.

### Session administrateur côté interface

| Fichier | Rôle |
|---------|------|
| `src/utils/admin-session.ts` | jeton en `sessionStorage`, expiration à 30 min, en-tête `X-Admin-Token` |
| `src/utils/admin-access.ts` | décide si une session est exigée (mode serveur + mot de passe configuré) |
| `src/utils/admin-unlock.ts` | appelle `config-auth/unlock`, stocke la session |
| `src/utils/config-auth-status.ts` | lit `config-auth/status` pour savoir si un mot de passe existe |
| `src/components/features/auth/admin-password-dialog.tsx` | demande le mot de passe après scan d'une carte admin |
| `src/components/features/config/config-auth-panel.tsx` | définit/change/supprime le mot de passe, champ `X-Setup-Token` au premier accès |

En mode tablette ou local, le parcours historique par carte reste actif : le
gating frontend ne s'applique que si `deployment === "server"` **et** qu'un mot
de passe est configuré. Le serveur reste l'autorité finale.

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
| Déploiement | `git pull`, `./server migrate` si migration, puis `./server rebuild` |
| CI | `.github/workflows/ci.yml` (build + tests sur MySQL éphémère) |
| Release | `.github/workflows/release.yml` |

Fichiers ignorés (jamais commités) :

```
.env.server  .env.frontend  **/.env  **/data  backups/  certs/
```

Vérification avant commit :

```bash
git status --short
git diff --stat
grep -RIn "API_TOKEN=\\|MOT_DE_PASSE\\|mysql://" --include='*.md' --include='*.yml' .
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

Le frontend n'a rien à changer : il ne connaît pas le jeton. En revanche,
**toutes les sessions administrateur en cours sont invalidées** (elles sont
signées avec l'ancien jeton) et il faut se reconnecter avec le mot de passe.

### Changer le mot de passe de configuration

Passer par **Config → Mot de passe de configuration**, avec une carte
administrateur et une session valide. Le changement invalide les sessions
ouvertes avec l'ancien mot de passe. En cas d'oubli, supprimer
`/app/data/config-auth.json` dans le volume réinitialise le mot de passe, mais
rouvre aussi l'amorçage : en mode serveur, définir le nouveau mot de passe
exigera le jeton d'installation (`API_TOKEN`). À faire uniquement sur le
serveur, avec une sauvegarde, puis reconfigurer immédiatement.

```bash
docker compose -f compose.server.yml --env-file .env.server \
  exec app rm /app/data/config-auth.json
```

### Changer les identifiants MySQL

1. `nano .env.server` → `DATABASE_URL` ;
2. `./server migrate` si la nouvelle base n'a pas encore les tables de sécurité ;
3. `./server rebuild` ;
4. vérifier `curl -k https://<domaine>/ready`.

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
4. la tester sur une copie de `BdeData`, puis l'appliquer pendant une fenêtre de
   maintenance. `pnpm db:migrate` rejoue l'historique Drizzle : sur une base
   existante créée hors Drizzle, préférez le SQL relu et appliqué à la main, ou
   étendez `src/db/migrate.ts` pour rester idempotent.

# Marco Prime — version serveur

Caisse et rechargement du BDE, accessibles depuis **n'importe quel appareil
doté d'un navigateur** (téléphone, ordinateur, tablette) sur le réseau de
l'école, via **HTTPS** et un nom de domaine interne.

Le backend, le frontend et le HTTPS tournent dans des conteneurs Docker sur le
serveur de l'école : un conteneur applicatif (API + fichiers statiques) et un
conteneur Caddy pour le HTTPS. Un troisième service, très court, prépare les
droits du volume au démarrage. Aucun identifiant MySQL n'est installé sur les
appareils clients.

---

## 1. Ce que fait Marco Prime

| Fonction | Détail |
|----------|--------|
| Vente | Scan de carte RFID (lecteur USB) ou saisie/recherche, panier, paiement transactionnel |
| Rechargement | CB ou espèces, validation par carte administrateur |
| Membres | Recherche, création, remplacement de badge, contrôle de cotisation |
| Catalogue | Sélection des produits vendus, prix, disponibilité Fouaille |
| Statistiques | Recettes, coûts d'achat, bénéfice sur une période |
| Compta réelle | Litres mesurés, prix d'achat au litre, recettes réelles, écarts, export CSV/JSON |
| Corrections | Annulation ou remplacement d'une vente, annulation d'un rechargement, avec journal d'audit |
| Configuration | Accès protégé par carte administrateur **et** mot de passe local |
| PWA | Installable sur téléphone/tablette, écran plein |

La version serveur reprend la version tablette (la plus complète : scan QR,
clavier tactile, panneaux d'administration) et la version bureau (correctifs
récents : compta, robustesse, audit), puis ajoute le déploiement réseau.

---

## 2. Architecture

```
   Téléphone      Ordinateur      Tablette / kiosque
        │              │                  │
        └──────────────┴──────────────────┘
                       │  HTTPS — port 443
                       ▼
┌──────────────────────── serveur de l'école ────────────────────────┐
│                                                                    │
│   conteneur « https » — Caddy                                      │
│     • certificat TLS, en-têtes de sécurité                         │
│     • reverse proxy vers l'application                             │
│                       │                                            │
│                       ▼                                            │
│   conteneur « app » — Node 24                                      │
│     • API Hono            /api/v1/*                                │
│     • frontend Preact     /*  (fichiers statiques)                 │
│     • volume /app/data    catalogue, compta, prix, journal         │
│                       │                                            │
└───────────────────────┼────────────────────────────────────────────┘
                        │  MySQL (port 3307)
                        ▼
              base Fouaille — BdeData
```

Un seul nom de domaine, une seule origine : le frontend appelle `/api/v1` en
relatif, donc **pas de CORS** et un seul certificat à gérer.

Au démarrage, un service éphémère `data-permissions` remet les droits du volume
`/app/data` à l'utilisateur du conteneur, puis s'arrête. Il évite qu'une
sauvegarde restaurée ou un volume recréé bloque l'écriture de la compta.

### Deux modes de déploiement

| Mode | Où tourne le frontend | Fichiers | Usage |
|------|-----------------------|----------|-------|
| **Intégré** (recommandé) | Sur le serveur, même origine que l'API | `Dockerfile.server`, `compose.server.yml` | Tous les appareils via `https://<domaine>/` |
| **Kiosque séparé** | Sur un Raspberry/mini-PC, API distante | `Dockerfile.frontend`, `compose.frontend.yml` | Écran de caisse dédié, réseau local du kiosque |

Le mode intégré est celui qui répond au besoin « accessible sur téléphone,
ordinateur, tout ce qui affiche une page web ».

---

## 3. Démarrage rapide (serveur)

Prérequis : Docker + Docker Compose, un nom de domaine qui pointe vers le
serveur, et les accès MySQL Fouaille.

```bash
git clone https://github.com/ZoZo-Campo/Marco-Prime-Server.git
cd Marco-Prime-Server

cp .env.server.example .env.server
chmod 600 .env.server
nano .env.server            # domaine, DATABASE_URL, API_TOKEN…

./server check              # valide la configuration Compose
./server start              # construit et démarre
./server url                # affiche l'adresse HTTPS
./server logs               # journaux en direct
```

La procédure complète, pas à pas, est dans
**[INSTALLATION_SERVEUR.md](INSTALLATION_SERVEUR.md)**.

Les valeurs à demander à l'administratrice réseau sont listées dans
**[CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md)**.

Les notions de DNS, ports, pare-feu et certificats sont expliquées sans jargon
dans **[RESEAU_ET_HTTPS.md](RESEAU_ET_HTTPS.md)**.

---

## 4. Commandes

### Serveur

| Commande | Effet |
|----------|-------|
| `./server start` | Construit l'image et démarre les conteneurs |
| `./server rebuild` | Reconstruit et recrée les conteneurs (après une mise à jour) |
| `./server stop` | Arrête et supprime les conteneurs (les volumes restent) |
| `./server status` | État des conteneurs et de la santé |
| `./server logs` | Journaux en direct |
| `./server check` | Vérifie la syntaxe de la configuration |
| `./server url` | Affiche l'adresse HTTPS |
| `./server backup` | Archive le volume de données dans `backups/` (application démarrée) |
| `./server cert` | Exporte l'autorité locale Caddy dans `certs/` (mode `tls internal`) |

### Kiosque séparé (optionnel)

| Commande | Effet |
|----------|-------|
| `./frontend start` | Construit et démarre le frontend local |
| `./frontend rebuild` | Reconstruit après changement d'URL ou de jeton |
| `./frontend logs` / `stop` / `status` / `check` | Idem serveur |

### Développement

```bash
cd marco-prime-backend  && pnpm install && pnpm dev
cd marco-prime-frontend && pnpm install && pnpm dev
```

Tests du backend (base locale `marco_prime_test`, jamais la production) :

```bash
# 1. Un MySQL local doit écouter sur 127.0.0.1:3306. Créez la base de test
#    avec un compte administrateur de ce MySQL (root ou équivalent).
mysql -h 127.0.0.1 -P 3306 -u root -p \
  -e "CREATE DATABASE IF NOT EXISTS marco_prime_test;"

# 2. Créez le schéma, puis lancez les tests.
cd marco-prime-backend
DATABASE_URL='mysql://UTILISATEUR:MOT_DE_PASSE@127.0.0.1:3306/marco_prime_test' \
  pnpm db:push
pnpm test
```

`pnpm test` lit `marco-prime-backend/.env.test` et réinitialise la base à chaque
exécution. Adaptez ce fichier à votre MySQL local (l'exemple fourni utilise
`marco`/`marco123` : ce compte doit exister et avoir les droits sur
`marco_prime_test`), ou passez `DATABASE_URL` en variable d'environnement : elle
est prioritaire. Le lanceur refuse toute base non locale ou dont le nom ne
contient pas `test`.

---

## 5. Contenu du dépôt

```
Marco-Prime-Server/
├── marco-prime-backend/        API Node + Hono + Drizzle
│   ├── src/                    routes, services, dépôts, schéma
│   ├── tests/                  tests Vitest + lanceur sécurisé
│   ├── .env.example            modèle pour le mode local
│   └── .env.test               base de test locale (jamais la production)
├── marco-prime-frontend/       Preact + Vite + Tailwind
│   ├── src/                    pages, composants, hooks
│   └── public/                 PWA (manifest, service worker, icônes)
├── Dockerfile.server           image unique API + frontend
├── Dockerfile.frontend         frontend statique pour kiosque séparé
├── compose.server.yml          app + Caddy (+ service de préparation du volume)
├── compose.frontend.yml        frontend seul (Raspberry)
├── Caddyfile                   HTTPS et reverse proxy
├── nginx.frontend.conf         service statique du kiosque
├── server / frontend           scripts de déploiement
├── .env.server.example         variables du serveur
├── .env.frontend.example       variables du kiosque
├── README.md                   ce fichier
├── INSTALLATION_SERVEUR.md     déploiement pas à pas
├── RESEAU_ET_HTTPS.md          DNS, ports, certificats expliqués
├── OUTILS.md                   inventaire des outils et de leur rôle
└── CONFIGURATION_A_REMPLIR.md  valeurs à obtenir
```

---

## 6. Données conservées

Le volume Docker `marco_server_data` est monté sur `/app/data`. Il contient :

| Fichier | Contenu |
|---------|---------|
| `catalog-selection.json` | Produits vendus sur cette Marco |
| `product-costs.json` | Prix d'achat saisis pour les statistiques |
| `accounting.json` | Compta réelle, période de la soirée, clôture |
| `order-corrections.json` | Journal des corrections de ventes |
| `recharge-corrections.json` | Journal des annulations de rechargements |
| `recharge-methods.json` | Méthode de paiement par défaut du rechargement |
| `config-auth.json` | Mot de passe local de la configuration (hash) |

Ce volume doit être sauvegardé : le perdre ferait perdre la compta et la
protection contre une double correction. `./server backup` crée une archive
datée dans `backups/`.

---

## 7. Sécurité

- **Un seul point d'entrée** : Caddy expose uniquement 80/443 ; l'API n'est
  jamais publiée directement.
- **Jeton d'API** : `API_TOKEN` est exigé sur `/api/v1/*`. Il est distribué au
  frontend par `/runtime-config.js` — il empêche les appels accidentels et les
  requêtes d'un autre site, mais **ne protège pas** quelqu'un qui peut ouvrir la
  page. La vraie barrière est l'accès réseau (voir `RESEAU_ET_HTTPS.md`).
- **HTTPS** : obligatoire pour la PWA et pour ne pas transmettre les numéros de
  carte en clair.
- **Configuration** : carte administrateur + mot de passe local ; les routes
  d'édition du `.env` sont désactivées en mode serveur.
- **Conteneurs** : lecture seule, capacités retirées, `no-new-privileges`,
  utilisateur non privilégié.
- **Secrets** : `.env.server`, `.env.frontend`, `backups/` et `certs/` sont
  ignorés par Git. Ne les publiez jamais.

---

## 8. Documentation détaillée

| Document | Contenu |
|----------|---------|
| [INSTALLATION_SERVEUR.md](INSTALLATION_SERVEUR.md) | Prérequis, DNS, Docker, HTTPS, déploiement, mises à jour, sauvegardes, dépannage |
| [RESEAU_ET_HTTPS.md](RESEAU_ET_HTTPS.md) | Ce qu'est un domaine interne, quels ports ouvrir, comment fonctionne un certificat |
| [OUTILS.md](OUTILS.md) | Chaque outil utilisé, son rôle et où le régler |
| [CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md) | Liste des valeurs à obtenir et à qui les demander |
| [marco-prime-backend/README.md](marco-prime-backend/README.md) | API, routes, schéma, tests |

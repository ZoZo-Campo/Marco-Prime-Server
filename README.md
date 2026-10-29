# Marco Prime — la caisse du BDE, accessible depuis un navigateur

Marco Prime sert à **encaisser les ventes et les rechargements du BDE** pendant
une soirée. La version de ce dépôt est la **version serveur** : l'application
tourne sur un serveur de l'école et tout le monde y accède avec un simple
navigateur, sur téléphone, ordinateur ou tablette.

> **En une phrase :** on installe l'application une seule fois sur un serveur,
> puis on l'ouvre à l'adresse `https://marco.<domaine-de-l-école>/` depuis
> n'importe quel appareil du réseau. Rien n'est installé sur les appareils, et
> aucun identifiant de base de données n'y circule.

---

## Sommaire

1. [À quoi ça sert](#1-à-quoi-ça-sert)
2. [Qui fait quoi](#2-qui-fait-quoi)
3. [Ce qui se passe quand on ouvre l'adresse](#3-ce-qui-se-passe-quand-on-ouvre-ladresse)
4. [Deux façons de l'utiliser](#4-deux-façons-de-lutiliser)
5. [Installer le serveur](#5-installer-le-serveur)
6. [Les commandes du quotidien](#6-les-commandes-du-quotidien)
7. [Les données et les sauvegardes](#7-les-données-et-les-sauvegardes)
8. [La sécurité, sans jargon](#8-la-sécurité-sans-jargon)
9. [La documentation](#9-la-documentation)
10. [Ce que contient le dépôt](#10-ce-que-contient-le-dépôt)
11. [Développer et tester](#11-développer-et-tester)
12. [Quand quelque chose ne marche pas](#12-quand-quelque-chose-ne-marche-pas)

---

## 1. À quoi ça sert

| Besoin | Ce que fait Marco Prime |
|--------|--------------------------|
| Encaisser une vente | Scan de la carte RFID de l'étudiant (ou recherche au clavier tactile), panier, débit du solde |
| Recharger une carte | Paiement en espèces ou par CB, validé par une carte administrateur |
| Gérer les membres | Recherche, création, remplacement de badge, contrôle de la cotisation |
| Suivre le catalogue | Choix des produits vendus ce soir, prix, disponibilité partagée avec Fouaille |
| Faire les comptes | Recettes, coûts d'achat, bénéfice, compta réelle (litres, prix au litre, écarts), exports CSV/JSON |
| Corriger une erreur | Annulation ou remplacement d'une vente, annulation d'un rechargement, avec journal d'audit |
| Vérifier l'état du système | État de l'API, de la base et de la synchronisation Fouaille |

L'interface s'adapte à l'écran, s'installe comme une application sur téléphone
(PWA) et propose un scan de QR code pour retrouver un membre.

---

## 2. Qui fait quoi

Trois acteurs, trois rôles :

```
  Téléphone · Ordinateur · Tablette
              │
              │  HTTPS (port 443)
              ▼
  ┌──────────────────────────┐
  │  Serveur de l'école      │
  │                          │
  │  Caddy  ──►  Application │   API + interface + données locales
  │  (HTTPS)     (Node.js)   │
  └──────────────┬───────────┘
                 │  MySQL (port 3306, ou celui fourni)
                 ▼
        Base Fouaille « BdeData »
```

- **Les appareils** n'ont besoin que d'un navigateur. Ils ne stockent aucun
  identifiant.
- **Le serveur Marco** héberge l'application et le HTTPS. Il garde aussi dans un
  volume les réglages propres à la soirée (compta, catalogue, prix d'achat).
- **La base Fouaille** reste la source de vérité pour les membres, les produits,
  les soldes et les ventes. Marco y lit et y écrit, mais ne la remplace pas.

---

## 3. Ce qui se passe quand on ouvre l'adresse

1. L'appareil demande à l'annuaire réseau (**DNS**) à quelle machine correspond
   le nom `marco.<domaine>`. La réponse est l'adresse IP du serveur.
2. Le navigateur se connecte en **HTTPS** sur le port 443. **Caddy** présente le
   certificat et déchiffre la connexion.
3. Caddy transmet la requête à l'application, sur le réseau interne Docker. Ce
   conteneur n'est jamais joignable directement depuis l'extérieur.
4. L'application renvoie l'interface (HTML, CSS, JavaScript). Le navigateur
   charge ensuite `/runtime-config.js`, qui ne contient que l'adresse de l'API
   et le mode de déploiement — **aucun secret**.
5. Chaque action (scanner une carte, valider un achat) appelle `/api/v1/...`.
   Caddy ajoute lui-même le jeton d'API à la requête avant de la transmettre :
   le navigateur ne le reçoit jamais. L'application interroge MySQL Fouaille,
   met à jour le solde et enregistre la vente.
6. Une action sensible (configuration, statistiques, correction, rechargement
   validé par un administrateur) exige en plus une **session administrateur
   signée**, ouverte avec le mot de passe de configuration et valable
   30 minutes.
7. Les données propres à la soirée (compta, sélection du catalogue) sont
   écrites dans un volume Docker, sauvegardable.

Tout passe par **un seul nom de domaine** et **une seule origine** : il n'y a
donc ni configuration CORS, ni second certificat à gérer.

---

## 4. Deux façons de l'utiliser

| Mode | Où tourne l'interface | Pour qui | Fichiers |
|------|------------------------|----------|----------|
| **Serveur** (recommandé) | Sur le serveur, avec l'API | Tous les appareils du réseau, via une seule adresse HTTPS | `Dockerfile.server`, `compose.server.yml` |
| **Kiosque séparé** | Sur un Raspberry ou un mini-PC dédié | Un écran de caisse fixe, qui appelle une API distante | `Dockerfile.frontend`, `compose.frontend.yml` |

Le mode serveur est celui qui répond au besoin « utilisable partout ». Le mode
kiosque reste disponible pour un poste fixe.

---

## 5. Installer le serveur

### Ce qu'il faut

- Un serveur Linux (Debian ou Ubuntu de préférence) avec `sudo`, une **IP fixe**
  et **Docker + Docker Compose**.
- Un **nom de domaine** qui pointe vers ce serveur (créé par le service
  informatique).
- Les **ports 80 et 443** ouverts depuis le réseau de l'école.
- Un **compte MySQL dédié** sur la base Fouaille `BdeData`.
- Un **certificat** : fourni par l'école, autorité locale Caddy, ou Let's
  Encrypt selon le cas.

Les questions exactes à poser à l'informatique sont dans
**[CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md)**.

### Installation express

```bash
git clone https://github.com/ZoZo-Campo/Marco-Prime-Server.git
cd Marco-Prime-Server

cp .env.server.example .env.server
chmod 600 .env.server
nano .env.server          # domaine, DATABASE_URL, API_TOKEN…

./server check            # vérifie la configuration
./server start            # construit l'image et démarre
./server url              # affiche l'adresse HTTPS à ouvrir
```

La première construction prend 2 à 5 minutes. Ensuite, ouvrez l'adresse depuis
un appareil du réseau de l'école.

> **Base Fouaille déjà existante (`BdeData`).** Avant la première utilisation,
> appliquez une fois les tables et index de sécurité :
> `./server migrate`. La commande ne supprime aucune donnée, mais elle crée des
> tables et des index : faites une sauvegarde et testez-la d'abord sur une copie
> de la base. Si le compte MySQL n'a pas les droits `CREATE`/`ALTER`/`INDEX`,
> demandez au service informatique d'exécuter la migration.

> La procédure détaillée, les trois modes de certificat et le dépannage sont
> dans **[INSTALLATION_SERVEUR.md](INSTALLATION_SERVEUR.md)**.
> Les notions de DNS, ports et certificats sont expliquées simplement dans
> **[RESEAU_ET_HTTPS.md](RESEAU_ET_HTTPS.md)**.

---

## 6. Les commandes du quotidien

| Commande | Ce qu'elle fait |
|----------|-----------------|
| `./server start` | Construit l'image et démarre les conteneurs |
| `./server rebuild` | Reconstruit et recrée les conteneurs après une mise à jour |
| `./server stop` | Arrête et supprime les conteneurs (les volumes restent) |
| `./server status` | Affiche l'état et la santé des conteneurs |
| `./server logs` | Affiche les journaux en direct |
| `./server check` | Vérifie la syntaxe de la configuration |
| `./server url` | Affiche l'adresse HTTPS |
| `./server migrate` | Ajoute les tables et index de sécurité à une base existante, sans supprimer de données |
| `./server backup` | Archive le volume de données dans `backups/` |
| `./server restore <archive>` | Remplace le volume de données par une sauvegarde, après confirmation |
| `./server cert` | Exporte l'autorité locale Caddy dans `certs/` (mode `tls internal`) |

Mise à jour :

```bash
git pull
./server migrate     # uniquement si la version ajoute une migration
./server rebuild
```

Les mises à jour ne touchent ni `.env.server`, ni le volume de données.

---

## 7. Les données et les sauvegardes

Le volume Docker `marco_server_data` est monté sur `/app/data`. Il contient ce
qui est propre à cette Marco :

| Fichier | Contenu |
|---------|---------|
| `catalog-selection.json` | Produits vendus sur cette Marco |
| `product-costs.json` | Prix d'achat saisis pour les statistiques |
| `accounting.json` | Compta réelle, période de la soirée, clôture |
| `order-corrections.json` | Journal des corrections de ventes |
| `recharge-corrections.json` | Journal des annulations de rechargements |
| `recharge-methods.json` | Méthode de paiement par défaut |
| `config-auth.json` | Mot de passe de configuration (haché), lié à une carte admin |

Deux tables sont également ajoutées à la base Fouaille par `./server migrate` :

| Table | Rôle |
|-------|------|
| `idempotency_keys` | Empêche qu'un achat ou un rechargement soit débité deux fois après une coupure réseau ; conservée 30 jours |
| `order_corrections` | Empêche qu'une même vente ou un même rechargement soit corrigé deux fois, même si le volume local est perdu |

Ces tables ne contiennent aucune donnée métier nouvelle : elles protègent les
écritures existantes. La migration ne supprime ni ne modifie les membres, les
produits, les soldes ou les ventes.

Ces fichiers sont précieux : ils portent la compta et la protection contre une
double correction. Sauvegardez-les :

```bash
./server backup
# → backups/marco-data-20261028-120000.tar.gz
```

Copiez aussi `.env.server` dans un endroit sûr (gestionnaire de mots de passe du
BDE). Sans lui, il faudra redemander les identifiants MySQL.

La restauration et l'automatisation par cron sont décrites dans
**[INSTALLATION_SERVEUR.md](INSTALLATION_SERVEUR.md)** (sections 10 et 11).

---

## 8. La sécurité, sans jargon

- **Un seul point d'entrée.** Seul Caddy est exposé (80/443). L'application
  n'est jamais publiée directement sur le réseau.
- **HTTPS partout.** Il protège les numéros de carte et il est obligatoire pour
  installer la PWA.
- **Le jeton d'API ne va plus dans le navigateur.** Caddy l'ajoute lui-même à
  chaque requête vers l'application. Il sert à authentifier le proxy, pas à
  identifier une personne : il ne faut pas le considérer comme un mot de passe.
- **Une session administrateur signée.** Le mot de passe de configuration ouvre
  une session de 30 minutes, liée à la carte de l'administrateur. Elle est
  exigée sur les actions sensibles : configuration, statistiques, comptabilité,
  corrections, création/modification de membres ou de produits, changement de
  méthode de rechargement. Un numéro de carte seul ne suffit plus.
- **Premier mot de passe protégé.** En mode serveur, définir le tout premier
  mot de passe exige le jeton d'installation (`X-Setup-Token`, égal à
  `API_TOKEN`). Une carte admin trouvée au hasard ne peut donc pas prendre le
  contrôle avant le vrai administrateur.
- **Limites techniques.** Corps de requête limité à 1 Mo, 300 requêtes par
  minute et par IP, 30 requêtes par minute sur les routes de mot de passe.
  Verrouillage temporaire après plusieurs échecs.
- **Des conteneurs verrouillés.** Lecture seule, capacités Linux retirées,
  `no-new-privileges`, utilisateur non privilégié, limites CPU/RAM/PIDs et
  rotation des journaux Docker.
- **Aucun secret dans Git.** `.env.server`, `.env.frontend`, `backups/` et
  `certs/` sont ignorés. Ne les publiez jamais.

La documentation d'API (`/ui` et `/doc`) est bloquée par Caddy : elle répond
`404` en production.

> **La vraie barrière reste l'accès réseau.** Les routes de caisse (recherche
> d'un membre, achat, rechargement, historique, catalogue) sont volontairement
> accessibles à un appareil du réseau pour ne pas ralentir le passage en caisse.
> Marco doit donc rester sur le réseau de l'école, **jamais exposé directement
> à Internet** sans VPN ou authentification par utilisateur. Les routes de
> recherche et d'historique peuvent révéler des noms et des soldes à quelqu'un
> qui se trouve déjà sur ce réseau.

---

## 9. La documentation

| Document | À lire quand… |
|----------|----------------|
| **[INSTALLATION_SERVEUR.md](INSTALLATION_SERVEUR.md)** | Vous installez, mettez à jour, sauvegardez ou dépannez le serveur |
| **[RESEAU_ET_HTTPS.md](RESEAU_ET_HTTPS.md)** | Vous parlez au service informatique (DNS, ports, certificats) |
| **[OUTILS.md](OUTILS.md)** | Vous voulez savoir à quoi sert chaque outil et où le régler |
| **[CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md)** | Il vous manque une valeur (domaine, IP, MySQL…) |
| **[marco-prime-backend/README.md](marco-prime-backend/README.md)** | Vous travaillez sur l'API, les routes ou le schéma |

---

## 10. Ce que contient le dépôt

```
Marco-Prime-Server/
├── marco-prime-backend/        API Node.js + Hono + Drizzle
│   ├── src/                    routes, services, dépôts, schéma MySQL
│   ├── drizzle/                migrations SQL
│   ├── tests/                  tests Vitest + lanceur sécurisé
│   ├── .env.example            modèle pour le mode local
│   └── .env.test               base de test locale (jamais la production)
├── marco-prime-frontend/       Interface Preact + Vite + Tailwind
│   ├── src/                    pages, composants, hooks
│   └── public/                 PWA (manifest, service worker, icônes)
├── .github/workflows/          CI (tests) et release
├── Dockerfile.server           image unique : API + interface
├── Dockerfile.frontend         interface statique pour un kiosque séparé
├── compose.server.yml          application + Caddy + préparation du volume
├── compose.frontend.yml        kiosque seul (Raspberry)
├── Caddyfile                   HTTPS et reverse proxy
├── nginx.frontend.conf         service statique du kiosque
├── server / frontend           scripts de déploiement
├── .env.server.example         variables du serveur
├── .env.frontend.example       variables du kiosque
└── *.md                        cette documentation
```

---

## 11. Développer et tester

```bash
# API
cd marco-prime-backend && pnpm install && pnpm dev

# Interface
cd marco-prime-frontend && pnpm install && pnpm dev
```

Tests de l'API, sur une base **locale** `marco_prime_test` (jamais la production) :

```bash
# 1. Créer la base de test dans le MySQL local
mysql -h 127.0.0.1 -P 3306 -u root -p \
  -e "CREATE DATABASE IF NOT EXISTS marco_prime_test;"

# 2. Créer le schéma, les tables de sécurité, puis lancer les tests
cd marco-prime-backend
DATABASE_URL='mysql://UTILISATEUR:MOT_DE_PASSE@127.0.0.1:3306/marco_prime_test' \
  pnpm db:push
DATABASE_URL='mysql://UTILISATEUR:MOT_DE_PASSE@127.0.0.1:3306/marco_prime_test' \
  pnpm db:security
pnpm test
```

`pnpm test` lit `marco-prime-backend/.env.test` et réinitialise la base à chaque
exécution. Adaptez ce fichier à votre MySQL local, ou passez `DATABASE_URL` en
variable d'environnement : elle est prioritaire. `pnpm db:security` est
idempotent : il peut être relancé sans risque et ne supprime aucune donnée.

Le lanceur de tests **refuse** toute base non locale ou dont le nom ne contient
pas `test`. Il est donc impossible de lancer les tests contre `BdeData` par
erreur.

---

## 12. Quand quelque chose ne marche pas

| Symptôme | Première vérification |
|----------|------------------------|
| « Site inaccessible » | Le nom résout-il ? `dig +short <domaine>` |
| Avertissement de certificat | Normal en `tls internal` tant que l'autorité n'est pas installée (section 6 de `INSTALLATION_SERVEUR.md`) |
| `502` / `503` | `./server status` puis `./server logs` |
| `401` sur toute l'API | Le jeton injecté par Caddy ne correspond pas à celui de l'application : `./server check` puis `./server rebuild` |
| « Session administrateur requise » | La session de 30 minutes a expiré : rouvrez-la avec le mot de passe de configuration |
| « Jeton d'installation requis » | Définissez le premier mot de passe avec `X-Setup-Token` égal à `API_TOKEN` (section 8 de `INSTALLATION_SERVEUR.md`) |
| « Configuration gérée sur le serveur » | C'est voulu : modifiez `.env.server` sur l'hôte puis `./server rebuild` |
| « Base indisponible » | Vérifiez `/ready` puis les droits MySQL du compte |

Le dépannage complet, cause par cause, est dans
**[INSTALLATION_SERVEUR.md](INSTALLATION_SERVEUR.md#11-dépannage)**.

---

## Origine et licence

Projet du BDE d'Info Telecom Strasbourg.
Code propriétaire — voir la licence du backend.

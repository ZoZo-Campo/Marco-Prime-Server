# Marco Prime Backend API

API backend pour la gestion des commandes, produits, membres et recharges de Marco Prime.

## Technologies

- **[Hono](https://hono.dev/)** - Framework web léger et rapide
- **[Drizzle ORM](https://orm.drizzle.team/)** - ORM TypeScript moderne
- **[Zod](https://zod.dev/)** - Validation de schémas
- **[MySQL](https://www.mysql.com/)** - Base de données
- **[Vitest](https://vitest.dev/)** - Framework de tests
- **[TypeScript](https://www.typescriptlang.org/)** - Typage statique

## Prérequis

- Node.js 20+
- pnpm
- MySQL 8+

## Installation

```bash
# Cloner le dépôt
git clone <repo-url>
cd backend

# Installer les dépendances
pnpm install

# Configurer les variables d'environnement
cp .env.example .env
```

## Configuration

Deux modes utilisent le même code :

- **serveur** (`MARCO_DEPLOYMENT=server`) : l'API et le frontend sont servis
  par Docker derrière Caddy. La configuration vit dans `.env.server` à la racine
  du dépôt et n'est jamais modifiable depuis l'interface.
- **local** (tablette Termux ou poste de développement) : `.env` local, import
  possible depuis **Configuration → Installation**.

En développement :

```bash
cp .env.example .env
```

Le `.env` réel ne doit jamais être commité. En mode serveur, les variables sont
décrites dans `.env.server.example` et documentées dans
[INSTALLATION_SERVEUR.md](../INSTALLATION_SERVEUR.md).

```env
API_PORT=3000
API_HOST=0.0.0.0
MARCO_DEPLOYMENT=server
API_AUTH_ENABLED=true
API_TOKEN=<64 caractères hexadécimaux>
DATABASE_URL="mysql://user:password@host:3306/database_name"
NODE_ENV=production
FRONTEND_URL=https://marco.example.fr
FOUAILLE_API_URL="https://fouaille.example.fr/api/product"
FOUAILLE_SYNC_ENABLED=false
FOUAILLE_SYNC_INTERVAL_MS=300000
MARCO_DATA_DIR=/app/data
```

`GET /runtime-config.js` expose au frontend l'URL de l'API et le mode de
déploiement, **sans jeton**. En mode serveur, Caddy ajoute
`Authorization: Bearer $API_TOKEN` à chaque requête vers l'API. Le frontend n'a
donc pas besoin d'être reconstruit quand le jeton change ; en revanche, changer
`API_TOKEN` invalide les sessions administrateur en cours.

## Scripts disponibles

### Développement

```bash
# Démarrer le serveur en mode développement
pnpm dev

# Lancer les tests
pnpm test

# Lancer les tests en mode watch
pnpm test:watch

# Générer le rapport de couverture
pnpm test:coverage
```

### Production

```bash
# Compiler le projet
pnpm build

# Démarrer le serveur en production
pnpm start
```

### Base de données

```bash
# Synchroniser le schéma avec la base de données
pnpm db:push

# Générer les migrations
pnpm db:generate

# Appliquer les migrations
pnpm db:migrate

# Ajouter les tables/index de sécurité à une base existante (idempotent)
pnpm db:security

# Ouvrir Drizzle Studio
pnpm db:studio

# Remplir la base avec des données de test
pnpm db:seed
```

`pnpm db:security` exécute `src/db/migrate.ts` : il crée `idempotency_keys` et
`order_corrections`, ajoute l'unicité des badges et les index de lecture, sans
supprimer aucune donnée. Il est prévu pour `BdeData` déjà existante. Sur une base
neuve, `pnpm db:migrate` applique l'historique Drizzle complet. Sur le serveur,
la commande équivalente est `./server migrate`.

## Documentation API

Une documentation Swagger UI interactive est disponible en développement :

- **Swagger UI**: http://localhost:3000/ui
- **Spécification OpenAPI**: http://localhost:3000/doc

En production, le `Caddyfile` fait répondre `404` à ces deux routes. Elles ne
décrivent que les routes et les schémas, sans données, mais elles restent une
surface d'attaque inutile sur un serveur exposé.

## Endpoints principaux

### Santé et configuration
- `GET /health` - Vérifier que le serveur répond
- `GET /ready` - Vérifier aussi la connexion MySQL
- `GET /api/v1/system/status` - État du serveur, de la base et de l'API Fouaille
- `POST /api/v1/system/env/status` - Lire l'état masqué du `.env` (administrateur, mode local)
- `POST /api/v1/system/env/validate` - Valider un `.env` et tester MySQL (administrateur, mode local)
- `POST /api/v1/system/env` - Importer le `.env`, créer une sauvegarde et redémarrer (administrateur, mode local)

En mode serveur, ces trois routes répondent `409` : `.env.server` est géré sur
l'hôte, le conteneur est en lecture seule.

### Membres
- `GET /api/v1/member/:card_number` - Récupérer un membre par numéro de carte
- `POST /api/v1/members/search` - Rechercher un membre par nom et/ou promotion (carte administrateur requise)
- `POST /api/v1/admin/promotions` - Lister les promotions (administrateur)
- `POST /api/v1/admin/members/search` - Rechercher les membres, avec ou sans badge (administrateur)
- `POST /api/v1/admin/members` - Créer un membre Fouaille avec solde initial nul (administrateur)
- `PUT /api/v1/admin/members/badge` - Attribuer ou remplacer son badge sans toucher au solde ni à l’historique (administrateur)

Les réponses membre incluent `contributor` (colonne `members.contributor`). Dans
l’écran d’achat, un membre non cotisant déclenche un encart rouge et une
confirmation « Voulez-vous vraiment servir ? » ; « Non » efface la carte,
« Oui » autorise exceptionnellement la vente.

Dans les écrans d’achat et de rechargement, **Rechercher sans carte** ouvre un
clavier tactile AZERTY intégré. Une carte administrateur doit d’abord autoriser
la recherche ; le client choisi suit ensuite exactement le même parcours qu’un
client identifié par RFID.

### Produits
- `GET /api/v1/products` - Lister tous les produits
- `GET /api/v1/product-types` - Lister les catégories avec leur nombre de produits disponibles
- `GET /api/v1/products/:product_type_id` - Lister les produits disponibles d'une catégorie (paginé)
- `GET /api/v1/catalog-selection` - Lister le catalogue Fouaille et la sélection locale Marco
- `PUT /api/v1/catalog-selection` - Remplacer la sélection locale (carte administrateur requise)
- `POST /api/v1/admin/product-types` - Lister toutes les catégories Fouaille (administrateur)
- `POST /api/v1/admin/products` - Créer un produit indisponible par défaut (administrateur)
- `PUT /api/v1/admin/products/availability` - Modifier la disponibilité globale Fouaille (administrateur)

La disponibilité Fouaille est partagée entre les caisses. La sélection des
produits vendus ce soir est propre à la Marco. Les mutations de produits sont
refusées si `FOUAILLE_SYNC_ENABLED=true`, car la synchronisation écraserait
ces changements. Dans ce cas, `FOUAILLE_API_URL` doit aussi être défini :
aucune adresse Fouaille n'est codée en dur dans le dépôt.

Droits MySQL du compte applicatif : `SELECT`, `INSERT` et `UPDATE` sur
`members`, `products`, `product_types` et `orders`, plus `DELETE` sur
`idempotency_keys` (purge des clés anciennes). Aucun autre `DELETE` n'est
nécessaire en exploitation. `product_types` n'est écrit que par la
synchronisation Fouaille, et seulement si elle est activée. La migration
initiale (`pnpm db:security`, `./server migrate`) demande temporairement
`CREATE`, `ALTER` et `INDEX`.

### Commandes
- `GET /api/v1/history` - Historique paginé, filtrable par nom, produit, date ou numéro de transaction
- `POST /api/v1/purchase` - Créer un achat
- `POST /api/v1/order-corrections` - Lister les ventes récentes corrigibles (administrateur)
- `POST /api/v1/order-corrections/apply` - Annuler ou remplacer une vente (administrateur)

Un achat est refusé avant toute écriture si son total dépasse le solde du
membre. Le contrôle est refait dans la transaction MySQL après verrouillage du
membre : deux Marco utilisées en même temps ne peuvent donc pas faire passer le
solde sous zéro. Un paiement laissant exactement `0,00 €` reste autorisé. La
même protection s’applique à une correction qui augmenterait le montant débité.

Une correction conserve la vente d’origine pour l’audit. Dans une même
transaction MySQL, Marco rembourse intégralement cette vente, crée
éventuellement la ligne de remplacement et ajuste le solde une seule fois. Le
journal local `order-corrections.json` sert à l’affichage, mais la garde
anti-double-correction est la table `order_corrections` (`original_order_id`
unique) : même si le volume local est perdu, une seconde correction répond
`409`. Une correction laissée dans l’état `pending` après une coupure doit être
vérifiée par un administrateur avant toute intervention manuelle.

Dans l’interface, la correction se fait directement en touchant une ligne de
l’onglet **Historique**. Une carte administrateur et un motif d’au moins trois
caractères sont exigés. Le motif reste ensuite visible dans le détail des
écritures de correction.

### Statistiques (carte administrateur requise)
- `POST /api/v1/statistics` - Calculer recettes, coûts et bénéfice sur une période
- `POST /api/v1/statistics/costs` - Lire les prix d'achat enregistrés localement
- `PUT /api/v1/statistics/costs` - Enregistrer les prix d'achat dans le volume Marco

Les prix d'achat sont conservés dans `product-costs.json` sous
`MARCO_DATA_DIR`. Ils ne modifient jamais la base Fouaille. Les rechargements
sont présentés séparément des recettes de vente.

### Compta réelle (carte administrateur requise)
- `POST /api/v1/accounting` - Lire le tableau de comptabilité locale
- `PUT /api/v1/accounting` - Enregistrer le tableau de comptabilité locale
- `POST /api/v1/accounting/export` - Préparer l’export complet d’une soirée

Ce tableau est volontairement indépendant des ventes théoriques de Marco. Les
litres réellement mesurés, le prix d’achat par litre et les recettes réelles
sont saisis manuellement. Marco calcule seulement le coût total et le résultat
(`recettes - coût`). Il n’y a ni HT, ni TVA, ni brut/net. Les données sont
conservées dans `accounting.json` sous `MARCO_DATA_DIR`. Chaque ligne référence
un produit réel du catalogue Fouaille. Le brouillon s’enregistre automatiquement
et indique son état à l’écran. La période de la soirée est configurable via
l’heure de début et l’heure de fin, conservées dans `accounting.json`
(`eventStartTime` / `eventEndTime`, par défaut 16 h 30 → 23 h 59 ; si la fin est
avant le début, elle tombe le lendemain). **Préremplir depuis les ventes**
récupère les recettes Marco sur cette période, tout en laissant chaque montant
modifiable. L’export des rechargements possède sa **propre plage date + heure**
(`from` / `to`), avec les raccourcis « Soirée » (période de la compta) et
« Journée » (00 h 00 → 23 h 59). L’export complet, lui, filtre les ventes **et**
les rechargements sur la période de la soirée. Les produits actuellement
disponibles sont affichés avant les anciens produits ou produits hors vente.

**Nouvelle soirée** remet à zéro la date, les litres et les recettes, avec le
choix de conserver ou non les produits habituels. Les derniers prix d’achat au
litre strictement positifs restent mémorisés. La clôture guidée vérifie les prix,
les litres et l’export avant de verrouiller le bilan ; une soirée clôturée peut
être rouverte explicitement.

L’export complet demande un dossier à Chromium puis crée `compta.csv`,
`ventes.csv`, `rechargements.csv`, `corrections.csv` et
`sauvegarde-marco.json`. Les ventes **et** les rechargements sont filtrés sur la
même période que la soirée (date + heures de début/fin). Si le sélecteur de
dossier n’est pas disponible, les fichiers sont téléchargés dans le dossier
configuré dans Chromium.

### Recharges
- `POST /api/v1/recharge` - Recharger le solde d'un membre (500 € maximum par opération)
- `PUT /api/v1/recharge-method` - Changer la méthode de paiement par défaut (session administrateur)
- `POST /api/v1/recharge-corrections/apply` - Annuler un rechargement (session administrateur)

Un rechargement et un achat sont idempotents : le même `transactionId` rejoué
après une coupure renvoie la réponse enregistrée sans débiter une seconde fois.
La clé et la réponse sont stockées dans `idempotency_keys`, dans la même
transaction MySQL que l'écriture financière. Un `transactionId` réutilisé avec
un autre contenu est refusé (`409`).

### Session administrateur

Les routes marquées « administrateur » ci-dessus ne se contentent pas d'un
numéro de carte en mode serveur. Elles exigent aussi, dès qu'un mot de passe de
configuration existe :

```http
X-Admin-Token: <jeton renvoyé par POST /api/v1/config-auth/unlock>
```

La session dure 30 minutes, est signée avec `API_TOKEN` et est liée à la carte
de l'administrateur. `POST /api/v1/config-auth/unlock` accepte
`{ password, adminCardNumber? }` et renvoie `{ success, member, adminToken,
expiresAt }`. Le premier `POST /api/v1/config-auth/setup` exige
`X-Setup-Token: <API_TOKEN>`.

Les routes `/members/search` et `/history` restent publiques pour ne pas casser
le passage en caisse ; elles ne doivent être accessibles que depuis le réseau de
l'école. Voir la section « Sécurité » du README racine.

## Architecture

```
src/
├── config/          # Configuration (database, router, openapi, logger)
├── controllers/     # Logique métier des routes
├── repositories/    # Accès à la base de données
├── middlewares/     # Middlewares (auth, errors, rate-limiter)
├── validators/      # Schémas de validation Zod
├── db/             # Schéma Drizzle et seed
└── index.ts        # Point d'entrée de l'application
```

### Couches de l'application

1. **Controllers** - Gèrent les requêtes HTTP et la logique métier
2. **Repositories** - Encapsulent les requêtes vers la base de données
3. **Middlewares** - Gestion de l'authentification, erreurs, logging
4. **Validators** - Validation des données entrantes avec Zod

## Sécurité

- **Jeton d'API** - Bearer token sur toutes les routes `/api/v1/*`. En
  production, il est injecté par Caddy et n'est jamais envoyé au navigateur.
- **Session administrateur** - Jeton signé HMAC-SHA256, 30 minutes, exigé sur
  les routes sensibles en mode serveur dès qu'un mot de passe est configuré.
  Le numéro de carte seul ne suffit pas.
- **Amorçage** - Le premier mot de passe exige `X-Setup-Token: <API_TOKEN>`.
- **Idempotence** - Les achats et rechargements sont protégés par une clé
  persistée en base ; une double correction est bloquée par une contrainte
  unique.
- **Rate limiting** - 300 requêtes par minute et par IP ; 30 par minute sur
  `/api/v1/config-auth/unlock`, `setup`, `password` et `disable`. Verrouillage
  temporaire après plusieurs échecs de mot de passe.
- **Limite de corps** - 1 Mo par requête.
- **Validation** - Validation stricte des entrées avec Zod.
- **Error handling** - Gestion centralisée des erreurs avec HTTPException.
- **Journaux** - Numéros de carte masqués ; les réponses API sont en
  `Cache-Control: no-store`.

## Tests

Le projet utilise Vitest pour les tests unitaires et d'intégration.

`pnpm test` réinitialise d'abord la base locale `marco_prime_test` à partir de
`marco-prime-backend/.env.test`, puis lance Vitest. Les données de démonstration
sont donc toujours dans un état connu, sans reseed manuel. La préparation refuse
toute base non locale ou dont le nom ne contient pas `test` : la base de
production Fouaille n'est jamais touchée.

```bash
# Lancer tous les tests
pnpm test

# Mode watch
pnpm test:watch

# Avec couverture
pnpm test:coverage
```

Les tests couvrent:
- Routes health
- CRUD membres
- CRUD produits
- Historique des commandes
- Création d'achats, idempotence et concurrence
- Recharges de solde, plafond et annulation unique
- Corrections de ventes et de rechargements
- Sessions administrateur et amorçage du mot de passe

## Fonctionnalités

### Rate Limiting
- Limite de 300 requêtes par minute par IP sur `/api/v1/*`
- Limite de 30 requêtes par minute sur `unlock`, `setup`, `password` et `disable`
- Désactivé en environnement de test
- Adresse lue depuis la socket, puis `X-Real-IP` (réécrit par Caddy) ;
  `X-Forwarded-For` n'est pas utilisé

### Logging
- Logs HTTP sur la sortie standard (`docker compose logs`)
- Numéros de carte masqués dans les journaux
- Désactivé en environnement de test

### Gestion d'erreurs
- Utilisation de `HTTPException` de Hono
- Conversion automatique en JSON
- Messages d'erreur clairs et structurés

## Base de données

### Schéma principal

- **members** - Informations des membres
- **products** - Catalogue de produits
- **product_types** - Catégories de produits
- **orders** - Historique des commandes
- **idempotency_keys** - Réponses mémorisées des achats/rechargements (30 jours)
- **order_corrections** - Garde anti-double-correction

### Seed

La commande `pnpm db:seed` génère:
- 4 types de produits
- 30 membres (avec admins)
- 20 produits
- 100 commandes historiques

Elle refuse toute base dont le nom ne contient pas `test`. Elle supprime et
recrée les tables métier ainsi que les tables de sécurité : elle ne doit jamais
être lancée contre `BdeData`.

## Licence

Propriétaire - Info Telecom Strasbourg

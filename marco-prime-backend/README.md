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

Créer un fichier `.env` à la racine du projet:

```env
# API
API_PORT=3000
API_TOKEN=your-secret-token

# Database
DATABASE_URL=mysql://user:password@localhost:3306/database_name

# Environment
NODE_ENV=development
TZ=Europe/Paris
```

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

# Ouvrir Drizzle Studio
pnpm db:studio

# Remplir la base avec des données de test
pnpm db:seed
```

## Documentation API

Une documentation Swagger UI interactive est disponible une fois le serveur démarré:

- **Swagger UI**: http://localhost:3000/ui
- **Spécification OpenAPI**: http://localhost:3000/doc

## Endpoints principaux

### Santé
- `GET /health` - Vérifier l'état de l'API

### Membres
- `GET /api/v1/member/:card_number` - Récupérer un membre par numéro de carte

### Produits
- `GET /api/v1/products` - Lister tous les produits
- `GET /api/v1/product-types` - Lister les catégories avec leur nombre de produits disponibles
- `GET /api/v1/products/:product_type_id` - Lister les produits disponibles d'une catégorie (paginé)
- `GET /api/v1/catalog-selection` - Lister le catalogue Fouaille et la sélection locale Marco
- `PUT /api/v1/catalog-selection` - Remplacer la sélection locale (carte administrateur requise)

### Commandes
- `GET /api/v1/history` - Historique des commandes (paginé)
- `POST /api/v1/purchase` - Créer un achat

### Statistiques (carte administrateur requise)
- `POST /api/v1/statistics` - Calculer recettes, coûts et bénéfice sur une période
- `POST /api/v1/statistics/costs` - Lire les prix d'achat enregistrés localement
- `PUT /api/v1/statistics/costs` - Enregistrer les prix d'achat dans le volume Marco

Les prix d'achat sont conservés dans `product-costs.json` sous
`MARCO_DATA_DIR`. Ils ne modifient jamais la base Fouaille. Les rechargements
sont présentés séparément des recettes de vente.

### Recharges
- `POST /api/v1/recharge` - Recharger le solde d'un membre

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

- **Authentification** - Bearer token sur toutes les routes `/api/v1/*`
- **Rate limiting** - 100 requêtes par minute par IP
- **Validation** - Validation stricte des entrées avec Zod
- **Error handling** - Gestion centralisée des erreurs avec HTTPException

## Tests

Le projet utilise Vitest pour les tests unitaires et d'intégration.

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
- Création d'achats
- Recharges de solde

## Fonctionnalités

### Rate Limiting
- Limite de 100 requêtes par minute par IP
- Désactivé en environnement de test
- Basé sur les headers `x-forwarded-for` et `x-real-ip`

### Logging
- Logs HTTP avec timestamps
- Rotation quotidienne des fichiers de logs
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

### Seed

La commande `pnpm db:seed` génère:
- 4 types de produits
- 30 membres (avec admins)
- 20 produits
- 100 commandes historiques

## Licence

Propriétaire - Info Telecom Strasbourg

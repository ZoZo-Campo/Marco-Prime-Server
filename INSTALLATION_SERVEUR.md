# Installation du serveur Marco Prime

Guide complet, du serveur vide à `https://<domaine>/` utilisable depuis un
téléphone, un ordinateur ou une tablette du réseau de l'école.

Temps estimé : 45 à 90 minutes, dont l'essentiel dépend des réponses du service
informatique (DNS, ports, compte MySQL).

---

## 0. Ce dont vous avez besoin avant de commencer

| Élément | Qui le fournit | Où le noter |
|---------|----------------|-------------|
| Un serveur Linux (Debian/Ubuntu de préférence) avec accès `sudo` | Service informatique | — |
| Le nom de domaine à utiliser, ex. `marco.example.fr` | Service informatique | `MARCO_API_DOMAIN` |
| Une entrée DNS qui pointe vers le serveur | Service informatique | — |
| Les ports 80 et 443 joignables depuis le réseau de l'école | Service informatique | — |
| Un compte MySQL dédié à Marco sur la base Fouaille | Service informatique | `DATABASE_URL` |
| Les droits `CREATE`, `ALTER`, `INDEX` pour la migration initiale, ou une fenêtre où le service informatique l'exécute | Service informatique | `./server migrate` |
| Un jeton aléatoire de 64 caractères hexadécimaux | Vous | `API_TOKEN` |
| Le mot de passe de configuration (8 caractères minimum) et son lieu de stockage | Vous / BDE | interface Config, puis gestionnaire de mots de passe |

La checklist détaillée, avec les questions exactes à poser, est dans
[CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md).

> **Important — deux réseaux différents.**
> Le serveur doit joindre MySQL Fouaille (`mysql.example.fr:3306`), et les
> appareils clients doivent joindre le serveur en HTTPS. Ce sont deux flux
> distincts : le premier est sortant depuis le serveur, le second est entrant
> vers le serveur. Les deux doivent être autorisés.

---

## 1. Comprendre le montage en une minute

```
appareil client ──HTTPS 443──► Caddy ──HTTP interne──► app (API + frontend)
                                                          │
                                                          └──MySQL 3306──► Fouaille
```

- **Caddy** termine le HTTPS. C'est le seul conteneur exposé sur le réseau.
- **app** contient l'API *et* le frontend. Il n'écoute que dans le réseau Docker.
- Le **volume** `marco_server_data` garde les données locales (compta, catalogue).
- **MySQL Fouaille** reste la source de vérité pour les membres, produits, ventes.

Conséquence pratique : il n'y a **qu'un seul domaine et un seul certificat** à
gérer, et pas de CORS.

---

## 2. Préparer le serveur

### 2.1 Vérifier le système

```bash
cat /etc/os-release
uname -m
ip -4 addr show | grep inet
```

Notez l'adresse IP du serveur : c'est elle que le DNS devra viser.

### 2.2 Mettre à jour et installer les outils de base

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ufw
```

### 2.3 Installer Docker et Compose

```bash
# Dépôt officiel Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Sur Ubuntu, remplacez `debian` par `ubuntu` dans les deux lignes du dépôt.

Vérification :

```bash
docker --version
docker compose version
```

### 2.4 Autoriser votre utilisateur à lancer Docker

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

### 2.5 (Recommandé) Activer le pare-feu local

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status verbose
```

> Le port 22 doit rester ouvert, sinon vous perdez l'accès SSH.
> Le port 80 sert au renouvellement des certificats et aux redirections.

---

## 3. Réseau : DNS, ports et MySQL

### 3.1 DNS

Le service informatique doit créer un enregistrement de type **A** :

```
marco.example.fr.   A   <IP privée du serveur>
```

Sur un domaine interne, cet enregistrement est souvent servi par le DNS de
l'école (ou en « split-horizon » : la même zone répond différemment à
l'intérieur et à l'extérieur). Demandez explicitement :

> « Pouvez-vous créer `marco.example.fr` de type A vers `<IP du serveur>` sur le
> DNS utilisé par les postes du réseau pédagogique, et me confirmer que les
> clients internes résolvent bien ce nom ? »

Vérification depuis un poste client :

```bash
nslookup marco.example.fr      # Windows
dig +short marco.example.fr    # macOS / Linux
```

La réponse doit être l'IP du serveur. Si la réponse est vide ou pointe ailleurs,
inutile de continuer : HTTPS ne pourra pas fonctionner.

### 3.2 Ports entrants

| Port | Protocole | Depuis | Pourquoi |
|------|-----------|--------|----------|
| 443 | TCP | réseau de l'école | HTTPS (obligatoire) |
| 443 | UDP | réseau de l'école | HTTP/3 (facultatif, accélère) |
| 80 | TCP | réseau de l'école | redirection HTTP → HTTPS et validation ACME |

Rien d'autre ne doit être exposé : l'API n'est pas publiée directement.

### 3.3 Accès MySQL Fouaille

Le compte MySQL fourni doit pouvoir, depuis **l'adresse IP du serveur** :

```sql
SELECT 1;
```

et posséder les droits habituels de Marco sur la base `BdeData` :
`SELECT`, `INSERT`, `UPDATE` sur `members`, `products`, `product_types` et
`orders`, plus `DELETE` sur la seule table `idempotency_keys` (purge des clés
anciennes). Aucun `DELETE` n'est nécessaire sur les autres tables (voir
`marco-prime-backend/README.md` pour le détail des écritures).

La migration initiale `./server migrate` crée deux tables et des index : elle
demande temporairement `CREATE`, `ALTER` et `INDEX`. Si le service informatique
refuse ces droits au compte applicatif, demandez-lui d'exécuter la migration
une fois, ou de lancer `./server migrate` avec un compte administrateur. Le
compte applicatif peut ensuite revenir aux droits stricts ci-dessus.

Demandez un **compte dédié** plutôt que d'utiliser le compte root ou un compte
partagé. Format de l'URL :

```
mysql://UTILISATEUR:MOT_DE_PASSE@HOTE:3306/BdeData
```

Si le mot de passe contient `@`, `:`, `/` ou `#`, encodez-le :
`@` → `%40`, `#` → `%23`, `:` → `%3A`.

Test depuis le serveur :

```bash
sudo apt install -y default-mysql-client
mysql -h mysql.example.fr -P 3306 -u <utilisateur> -p -e "SELECT 1" BdeData
```

Si ce test échoue, l'application échouera aussi : réglez d'abord le réseau ou
les droits.

---

## 4. Récupérer le projet

```bash
cd /opt
sudo git clone https://github.com/ZoZo-Campo/Marco-Prime-Server.git
sudo chown -R "$USER":"$USER" /opt/Marco-Prime-Server
cd /opt/Marco-Prime-Server
```

> L'emplacement n'a pas d'importance, mais évitez un dossier synchronisé
> (Dropbox, iCloud) et gardez le même chemin pour les mises à jour.

---

## 5. Configurer `.env.server`

```bash
cp .env.server.example .env.server
chmod 600 .env.server
nano .env.server
```

Remplacez au minimum :

| Variable | Exemple | Remarque |
|----------|---------|----------|
| `MARCO_API_DOMAIN` | `marco.example.fr` | Sans `https://`, sans slash final |
| `MARCO_TLS_DIRECTIVE` | `tls internal` | Voir section 6 |
| `API_TOKEN` | `openssl rand -hex 32` | Exactement 64 caractères hexadécimaux |
| `DATABASE_URL` | `mysql://UTILISATEUR:MOT_DE_PASSE@mysql.example.fr:3306/BdeData` | Identifiants Fouaille |
| `FRONTEND_URL` | `https://marco.example.fr` | Origine autorisée |

Générer un jeton :

```bash
openssl rand -hex 32
```

Le même `API_TOKEN` sert à trois choses : authentifier Caddy auprès de l'API,
signer les sessions administrateur de 30 minutes, et autoriser le premier mot
de passe (`X-Setup-Token`). Il ne doit jamais être communiqué aux utilisateurs.
Le changer invalide immédiatement toutes les sessions ouvertes ; il faut alors
reconstruire les conteneurs.

Le fichier complet est commenté dans `.env.server.example`. Ne le commitez
jamais, ne le copiez jamais sur un appareil client.

Vérifier la syntaxe :

```bash
./server check
```

Erreurs fréquentes :

- `REPLACE_HERE` restant → le script refuse de démarrer, c'est volontaire ;
- guillemets manquants autour d'une valeur contenant des espaces ;
- `DATABASE_URL` non encodée.

---

## 6. Choisir le mode HTTPS

Le bon choix dépend de ce que le service informatique peut fournir. Trois cas.
La variable `MARCO_TLS_DIRECTIVE` contient la ligne TLS complète ; les trois
formes ci-dessous sont les seules valides.

### Cas A — certificat fourni par l'école (le plus propre)

Si l'école possède un certificat (souvent un *wildcard* `*.example.fr`) :

1. Copiez les deux fichiers sur le serveur :

   ```bash
   sudo mkdir -p /opt/Marco-Prime-Server/certs
   sudo cp fullchain.pem privkey.pem /opt/Marco-Prime-Server/certs/
   sudo chmod 640 /opt/Marco-Prime-Server/certs/*
   ```

2. Montez le dossier dans Caddy : dans `compose.server.yml`, service `https`,
   sous `volumes:`, décommentez la ligne prévue :

   ```yaml
       - ./certs:/certs:ro
   ```

   Sans ce montage, Caddy ne voit pas les fichiers et redémarre en boucle avec
   `open /certs/fullchain.pem: no such file or directory`.

3. Dans `.env.server` :

   ```env
   MARCO_TLS_DIRECTIVE=tls /certs/fullchain.pem /certs/privkey.pem
   ```

Aucun avertissement dans les navigateurs, aucun certificat à installer sur les
appareils. **C'est l'option à privilégier** si elle est disponible.

### Cas B — autorité locale Caddy (par défaut, réseau fermé)

Adapté à un domaine interne non joignable depuis Internet. Caddy crée sa propre
autorité de certification et signe le certificat du domaine.

```env
MARCO_TLS_DIRECTIVE=tls internal
```

Le chiffrement fonctionne immédiatement, mais les navigateurs affichent un
avertissement tant que l'autorité n'est pas installée sur l'appareil.

Exporter l'autorité :

```bash
./server cert
# → certs/marco-caddy-root.crt
```

Installation sur les appareils :

| Appareil | Procédure |
|----------|-----------|
| macOS | Double-clic sur le `.crt` → Trousseau → toujours faire confiance |
| Windows | Double-clic → Installer → « Autorités de certification racines de confiance » |
| Linux | `sudo cp marco-caddy-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates` |
| Android | Paramètres → Sécurité → Chiffrement et identifiants → Installer un certificat → Certificat CA |
| iOS | Envoyer le `.crt` → installer le profil → Réglages → Général → Informations → Réglages de confiance des certificats → activer |

Sans cette installation, la PWA ne peut pas être installée et les utilisateurs
voient un écran d'avertissement. Pour un déploiement sur des appareils nombreux
et non maîtrisés, préférez le cas A.

> Le nom du domaine doit correspondre exactement à celui du certificat. Si vous
> changez `MARCO_API_DOMAIN`, relancez `./server rebuild`.

### Cas C — Let's Encrypt (domaine public uniquement)

Possible seulement si le domaine résout publiquement vers une adresse joignable
depuis Internet, et si les ports 80/443 sont ouverts depuis Internet.

```env
MARCO_TLS_DIRECTIVE=tls votre-adresse@exemple.fr
```

Remplacez l'adresse par une adresse e-mail valide : elle sert de contact au
compte ACME. Caddy obtient et renouvelle le certificat seul.

Sur un domaine purement interne, cette option échoue : Caddy boucle en
redémarrage avec une erreur `challenge failed`. Dans ce cas, revenez au cas A
ou B.

## 7. Démarrer

```bash
cd /opt/Marco-Prime-Server
./server start
```

La première exécution construit l'image (2 à 5 minutes selon la machine).

> Le script `./server` ajoute toujours `-f compose.server.yml --env-file
> .env.server`. Si vous lancez Compose à la main, reprenez ces deux options :
> sans `--env-file`, `MARCO_API_DOMAIN` est vide et Compose refuse de démarrer.

Suivre la mise en route :

```bash
./server status
./server logs
```

Attendu :

- `app` → `healthy` ;
- `https` → `running` ;
- dans les journaux Caddy : `certificate obtained successfully` (cas A/C) ou
  `serving initial configuration` (cas B).

Ouvrir ensuite `./server url` dans un navigateur **d'un poste du réseau de
l'école**.

### 7.1 Appliquer la migration à une base existante

Si la base Fouaille `BdeData` existe déjà, elle n'a pas les deux tables de
protection ajoutées par cette version. Appliquez-les **une fois**, avant la
première utilisation :

```bash
./server backup          # sauvegarde du volume local
./server migrate         # demande une confirmation, puis applique le schéma
```

La commande est idempotente : elle peut être relancée sans risque. Elle ne
supprime aucune donnée et ne modifie ni les membres, ni les produits, ni les
soldes, ni les ventes. Elle :

- crée `idempotency_keys` (anti-double débit après une coupure réseau) ;
- crée `order_corrections` (anti-double correction d'une vente ou d'un
  rechargement) ;
- ajoute l'unicité des badges et des index de lecture.

Elle s'arrête proprement si des numéros de badge sont partagés par plusieurs
membres : corrigez ces doublons avant de relancer. Si la base est vide (aucune
table `members`), elle refuse de continuer : initialisez d'abord le schéma avec
`pnpm db:migrate` depuis `marco-prime-backend/`, ou importez `BdeData`.

> **À faire sur une copie d'abord.** La migration crée des tables et des index :
> testez-la sur une copie de `BdeData`, jamais directement sur la production
> sans sauvegarde. Le compte MySQL a besoin de `CREATE`, `ALTER` et `INDEX`.
> `MARCO_MIGRATE_YES=1 ./server migrate` évite la question interactive pour une
> exécution automatisée.

---

## 8. Vérifier que tout fonctionne

### 8.1 Côté serveur

```bash
# L'application répond
curl -k https://marco.example.fr/health
# → {"status":"ok"}

# La base est joignable
curl -k https://marco.example.fr/ready
# → {"status":"ready"}

# La configuration reçue par le navigateur ne contient aucun jeton
curl -k -s https://marco.example.fr/runtime-config.js
# → window.MARCO_CONFIG = {"apiUrl":"/api/v1","deployment":"server","apiTokenInjected":true};

# Caddy ajoute lui-même le jeton : la requête aboutit sans en-tête du client
curl -k -o /dev/null -w '%{http_code}\n' https://marco.example.fr/api/v1/system/status
# → 200

# La documentation d'API est volontairement masquée en production
curl -k -o /dev/null -w '%{http_code}\n' https://marco.example.fr/ui
# → 404
```

Pour vérifier que l'API refuse bien un appel **sans** le jeton, interrogez-la
directement dans le conteneur, sans passer par Caddy :

```bash
docker compose -f compose.server.yml --env-file .env.server exec app \
  node -e "fetch('http://127.0.0.1:3000/api/v1/system/status').then(r=>console.log(r.status))"
# → 401
```

`-k` ignore l'avertissement de certificat : utile pour diagnostiquer, à ne pas
utiliser comme test final. Si `curl` sans `-k` échoue alors que `-k` réussit, le
problème est le certificat (section 6).

### 8.2 Côté navigateur

1. `https://marco.example.fr/` s'ouvre sans avertissement.
2. L'écran d'accueil s'affiche, le logo et les boutons sont visibles.
3. Scanner une carte de test : le solde apparaît.
4. **Config** → scanner une carte administrateur.
5. **Premier accès seulement** : saisir le jeton d'installation (la valeur
   `API_TOKEN` de `.env.server`), puis choisir le mot de passe de configuration
   (8 caractères minimum). Ce jeton ne sert qu'une fois.
6. Les fois suivantes : carte administrateur, puis mot de passe. La session
   dure 30 minutes et reste liée à cette carte ; fermer l'onglet la supprime.
7. **Config → Statistiques** affiche l'état de la base.
8. **Rechargement** : pour créditer un membre non administrateur, scanner sa
   carte, choisir le montant, puis scanner la carte administrateur. Si aucune
   session n'est ouverte, le mot de passe est demandé sans perdre le panier.

### 8.3 Depuis un téléphone

Connectez le téléphone au Wi-Fi de l'école, ouvrez la même adresse. Le menu du
bas passe en icônes seules et la page d'achat s'empile verticalement.

Pour installer la PWA : menu du navigateur → « Ajouter à l'écran d'accueil ».
Cela nécessite un certificat de confiance (cas A ou B avec autorité installée).

---

## 9. Mettre à jour

```bash
cd /opt/Marco-Prime-Server
sudo -u "$USER" git pull
./server migrate     # uniquement si la version contient une migration
./server rebuild
```

`migrate` est idempotent et ne supprime aucune donnée. `rebuild` reconstruit
l'image, recrée les conteneurs et conserve les volumes. Vérifiez ensuite
`./server status` et rechargez la page (les fichiers statiques sont hachés,
aucun cache à vider manuellement).

> Les mises à jour ne touchent ni `.env.server`, ni le volume de données. Une
> migration ajoute seulement des tables et des index à la base Fouaille.

---

## 10. Sauvegarder et restaurer

### Sauvegarde

```bash
./server backup
# → backups/marco-data-20261028-120000.tar.gz
```

Automatiser chaque nuit à 3 h :

```bash
crontab -e
```

```cron
0 3 * * * cd /opt/Marco-Prime-Server && ./server backup >/var/log/marco-backup.log 2>&1
```

Copiez régulièrement `backups/` et `.env.server` hors du serveur (clé USB
chiffrée, espace BDE). Sans `.env.server`, il faudra redemander les
identifiants MySQL.

### Restauration

```bash
./server restore backups/marco-data-AAAA-MM-JJ-HHMMSS.tar.gz
```

Le script demande une confirmation, arrête l'application, remplace le contenu de
`/app/data` par l'archive, puis redémarre. C'est **destructif** pour les données
locales actuelles : faites une sauvegarde avant.

> Cette sauvegarde ne contient **pas** `BdeData` (membres, soldes, ventes). La
> restauration de la base MySQL est de la responsabilité du service
> informatique ; demandez-lui sa procédure et testez-la séparément.

---

## 11. Dépannage

### Le navigateur affiche « site inaccessible »

| Cause probable | Vérification | Solution |
|----------------|--------------|----------|
| DNS non résolu | `dig +short <domaine>` | Faire créer l'enregistrement A |
| Mauvaise IP | comparez avec `ip -4 addr` | Corriger le DNS |
| Ports bloqués | `nc -vz <domaine> 443` depuis un client | Ouvrir 443 dans le pare-feu |
| Conteneurs arrêtés | `./server status` | `./server logs` puis `./server start` |

### `502 Bad Gateway` ou `503`

Caddy joint le conteneur `app`, mais celui-ci ne répond pas.

```bash
./server logs          # chercher « Error » ou « DATABASE_URL »
./server status
```

Causes usuelles :

- `DATABASE_URL` invalide → l'API démarre mais `/ready` échoue ;
- MySQL injoignable depuis le serveur → tester avec `mysql` (section 3.3) ;
- conteneur `app` en `unhealthy` → consulter ses journaux.

### Caddy redémarre en boucle

```bash
docker compose -f compose.server.yml --env-file .env.server logs https --tail=50
```

- `challenge failed` → domaine non joignable depuis Internet : passez en
  `internal` ou utilisez un certificat fourni.
- `no such host` → DNS absent ou mal orthographié.
- `permission denied` sur `/data` → le volume Caddy (`caddy_data`) a des droits
  incorrects, souvent après un changement d'image. En dernier recours, recréez
  uniquement les volumes Caddy (les certificats seront redemandés) :

  ```bash
  ./server stop
  docker volume ls | grep caddy
  docker volume rm <projet>_caddy_data <projet>_caddy_config
  ./server start
  ```

  En mode `internal`, réexportez ensuite l'autorité (`./server cert`) et
  réinstallez-la sur les appareils. `./server stop` seul ne supprime jamais les
  volumes.

### Avertissement de certificat dans le navigateur

Normal en `internal` tant que l'autorité n'est pas installée (section 6, cas B).
En cas A, vérifiez que le certificat couvre bien le nom utilisé et qu'il n'est
pas expiré.

### `401 Unauthorized` sur toutes les routes de l'API

Deux causes différentes, à ne pas confondre.

**1. Le jeton injecté par Caddy ne correspond pas.** Caddy et l'application
lisent le même `API_TOKEN` dans `.env.server`, mais un conteneur peut avoir été
recréé avec une ancienne valeur :

```bash
grep -m1 '^API_TOKEN=' .env.server
./server rebuild
```

**2. La session administrateur manque ou a expiré.** Le message est
« Session administrateur requise » et seules les routes sensibles sont
concernées (configuration, statistiques, corrections, rechargement validé).
Rouvrez la session avec le mot de passe de configuration. Une session dure
30 minutes ; fermer l'onglet la supprime. Changer `API_TOKEN` invalide aussi
toutes les sessions en cours.

### « Jeton d'installation requis » au premier mot de passe

En mode serveur, le premier `POST /config-auth/setup` exige
`X-Setup-Token: <API_TOKEN>`. Dans l'interface, le champ « Jeton d'installation »
demande cette valeur. Copiez-la depuis `.env.server` sur le serveur, jamais
depuis un appareil client. Une fois le mot de passe défini, ce champ disparaît.

### « Configuration gérée sur le serveur » (409)

C'est voulu : en mode serveur, le `.env` ne se modifie pas depuis l'interface.
Éditez `.env.server` sur l'hôte puis `./server rebuild`.

### Les dates ou les heures sont décalées

Vérifiez `TZ=Europe/Paris` dans `.env.server` et que l'heure du serveur est
correcte :

```bash
timedatectl
```

### « Base indisponible » dans l'interface, mais `curl /ready` fonctionne

MySQL répond : vérifiez les droits du compte MySQL sur les tables utilisées par
l'écran ouvert (statistiques, membres, produits), puis les journaux de `app`.

### La migration échoue

| Message | Cause | Solution |
|---------|-------|----------|
| `La table members est absente` | Base vide ou mauvais nom de base | Initialiser le schéma ou corriger `DATABASE_URL` |
| `Des numéros de carte sont partagés` | Doublons de badges | Les corriger avant de relancer ; ne pas forcer l'index unique |
| `CREATE command denied` / `ALTER command denied` | Compte MySQL sans droits DDL | Faire exécuter `./server migrate` par le service informatique |
| `Table 'idempotency_keys' already exists` | Migration interrompue puis relancée | Normalement géré par `IF NOT EXISTS` ; vérifier la version du dépôt |

Ne relancez jamais la migration sur `BdeData` sans sauvegarde. Testez d'abord sur
une copie.

### Les modifications de prix/produits sont refusées

`FOUAILLE_SYNC_ENABLED=true` désactive volontairement les mutations, car la
synchronisation écraserait les changements. Repassez à `false` ou passez par
Fouaille.

### Le volume est en lecture seule / permission denied

```bash
./server status
```

Le service `data-permissions` doit s'être terminé avec succès avant `app`. S'il
a échoué :

```bash
./server stop
./server start
```

### Retrouver les journaux utiles

```bash
./server logs                                  # tout
docker compose -f compose.server.yml --env-file .env.server logs app   # application
docker compose -f compose.server.yml --env-file .env.server logs https # certificats et proxy
```

---

## 12. Désinstallation

```bash
./server stop

# Supprimer les volumes (DESTRUCTIF : perte de la compta locale)
docker volume rm marco-prime-server_marco_server_data \
                 marco-prime-server_caddy_data \
                 marco-prime-server_caddy_config

# Supprimer l'image
docker image rm marco-prime-server:local
```

Remplacez le préfixe `marco-prime-server_` par le nom de votre dossier de clone
en minuscules (`docker volume ls` les liste).

Faites une sauvegarde avant toute suppression de volume.

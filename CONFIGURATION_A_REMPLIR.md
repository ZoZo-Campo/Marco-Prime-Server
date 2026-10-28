# Valeurs à obtenir avant le déploiement

Checklist à remplir avec le service informatique. Chaque valeur a un exemple et
l'endroit exact où elle se place.

> Ne mettez **jamais** ces valeurs dans Git, dans un message public ou sur un
> appareil client. `.env.server` reste sur le serveur.

---

## 1. Réseau et domaine

| # | Information | Exemple | Où | Obtenu |
|---|-------------|---------|----|--------|
| 1 | Nom de domaine exact | `marco.its-tps.fr` | `MARCO_API_DOMAIN` | ☐ |
| 2 | Adresse IP fixe du serveur | `10.20.30.40` | DNS (A) | ☐ |
| 3 | DNS interne configuré vers cette IP | — | — | ☐ |
| 4 | Port 443 TCP ouvert depuis le réseau de l'école | — | pare-feu | ☐ |
| 5 | Port 80 TCP ouvert (redirection/ACME) | — | pare-feu | ☐ |
| 6 | Port 443 UDP ouvert (HTTP/3, facultatif) | — | pare-feu | ☐ |
| 7 | Le serveur joint `bde.its-tps.fr:3307` | — | pare-feu sortant | ☐ |
| 8 | Proxy HTTP : exception pour ce domaine | — | navigateurs | ☐ |

### Questions à poser

- Le nom est-il réservé sur le DNS interne, public, ou les deux ?
- L'IP du serveur est-elle fixe (ou réservée sur le DHCP) ?
- Les téléphones du Wi-Fi pédagogique accèdent-ils au même réseau que les
  ordinateurs ?
- Existe-t-il une inspection TLS ? Si oui, quel certificat est présenté aux
  clients ?

---

## 2. Certificat HTTPS

Choisir **une** option et la noter.

| Option | `MARCO_TLS_DIRECTIVE` | Fichiers nécessaires | Retenu |
|--------|---------------------|----------------------|--------|
| A. Certificat de l'école | `tls /certs/fullchain.pem /certs/privkey.pem` | `fullchain.pem`, `privkey.pem` | ☐ |
| B. Autorité locale Caddy | `tls internal` | aucun | ☐ |
| C. Let's Encrypt | `tls adresse@exemple.fr` | DNS public + ports Internet | ☐ |

Pour l'option A, demander :

- le certificat couvre-t-il exactement le nom choisi (`marco.its-tps.fr`) ou
  est-ce un wildcard `*.its-tps.fr` ?
- date d'expiration et procédure de renouvellement ;
- faut-il installer une autorité sur les appareils ?

---

## 3. Base de données Fouaille

| # | Information | Exemple | Où | Obtenu |
|---|-------------|---------|----|--------|
| 9 | Hôte MySQL | `bde.its-tps.fr` | `DATABASE_URL` | ☐ |
| 10 | Port MySQL | `3307` | `DATABASE_URL` | ☐ |
| 11 | Nom de la base | `BdeData` | `DATABASE_URL` | ☐ |
| 12 | Utilisateur dédié | `marco_server` | `DATABASE_URL` | ☐ |
| 13 | Mot de passe | *(secret)* | `DATABASE_URL` | ☐ |
| 14 | Droits accordés | `SELECT, INSERT, UPDATE` sur `members`, `products`, `product_types`, `orders` | — | ☐ |
| 15 | Accès autorisé depuis l'IP du serveur | — | — | ☐ |

URL finale (encoder les caractères spéciaux : `@` → `%40`) :

```env
DATABASE_URL=mysql://UTILISATEUR:MOT_DE_PASSE@HOTE:3307/BdeData
```

Test obligatoire depuis le serveur avant de continuer :

```bash
mysql -h bde.its-tps.fr -P 3307 -u UTILISATEUR -p -e "SELECT 1" BdeData
```

---

## 4. Jeton et origines

| # | Information | Comment | Où | Fait |
|---|-------------|---------|----|------|
| 16 | Jeton d'API | `openssl rand -hex 32` | `API_TOKEN` | ☐ |
| 17 | Origine du frontend | `https://<domaine>` | `FRONTEND_URL` | ☐ |

Le jeton n'est **pas** à demander à l'informatique : générez-le vous-même et
gardez-le dans un gestionnaire de mots de passe du BDE.

---

## 5. Sauvegarde et exploitation

| # | Sujet | À obtenir | Fait |
|---|-------|-----------|------|
| 18 | Sauvegarde du volume Docker | politique, emplacement, fréquence | ☐ |
| 19 | Sauvegarde de `.env.server` | coffre ou gestionnaire de secrets | ☐ |
| 20 | Accès SSH nominatif | compte + clé | ☐ |
| 21 | Fenêtre de maintenance | créneaux autorisés | ☐ |
| 22 | Contact en cas de panne réseau | nom + moyen | ☐ |
| 23 | Redémarrage automatique du serveur | configuré ? | ☐ |

---

## 6. Après remplissage : vérification finale

```bash
cd /opt/Marco-Prime-Server
./server check
./server start
./server url
```

Puis, depuis un appareil client :

```bash
dig +short marco.its-tps.fr          # → IP du serveur
curl -s https://marco.its-tps.fr/health   # → {"status":"ok"}
```

Ouvrir `https://marco.its-tps.fr/` sur :

- ☐ un ordinateur du réseau pédagogique ;
- ☐ un téléphone en Wi-Fi pédagogique ;
- ☐ une tablette du BDE.

Sur chacun : l'écran d'accueil s'affiche, une carte de test est reconnue, et
**Config** demande la carte administrateur.

---

## 7. Modèle de fichier `.env.server` rempli

À recopier en remplaçant les valeurs, puis `chmod 600 .env.server`.

```env
MARCO_API_DOMAIN=marco.its-tps.fr
MARCO_TLS_DIRECTIVE=tls internal

API_PORT=3000
API_HOST=0.0.0.0
MARCO_DEPLOYMENT=server
API_AUTH_ENABLED=true
API_TOKEN=<openssl rand -hex 32>
FRONTEND_URL=https://marco.its-tps.fr
PUBLIC_API_URL=/api/v1

DATABASE_URL=mysql://marco_server:<mot de passe>@bde.its-tps.fr:3307/BdeData

FOUAILLE_API_URL=https://fouaille.bde-tps.fr/api/product
FOUAILLE_SYNC_ENABLED=false
FOUAILLE_SYNC_INTERVAL_MS=300000

MARCO_DATA_DIR=/app/data
NODE_ENV=production
TZ=Europe/Paris
```

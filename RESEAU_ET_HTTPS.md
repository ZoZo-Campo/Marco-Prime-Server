# Réseau et HTTPS — explications

Ce document explique, sans supposer de connaissances réseau, comment Marco
Prime est joignable et pourquoi certaines étapes sont nécessaires. Il sert aussi
de support pour parler au service informatique.

---

## 1. Le vocabulaire minimum

| Terme | Définition simple |
|-------|-------------------|
| **Adresse IP** | Le numéro d'une machine sur un réseau, ex. `10.0.0.10` |
| **IP privée** | Adresse interne à l'école, non joignable depuis Internet |
| **IP publique** | Adresse visible depuis Internet |
| **Nom de domaine** | Nom lisible qui remplace une IP, ex. `marco.example.fr` |
| **DNS** | L'annuaire qui traduit un nom en adresse IP |
| **Enregistrement A** | La ligne DNS « ce nom → cette IP » |
| **Port** | La « porte » d'un service sur une machine (443 = HTTPS) |
| **Pare-feu** | Le filtre qui autorise ou bloque les connexions |
| **HTTPS / TLS** | La version chiffrée du web, avec un certificat |
| **Certificat** | Une preuve d'identité pour un nom de domaine |
| **Autorité de certification (CA)** | L'entité qui signe les certificats |
| **Reverse proxy** | Le service qui reçoit le HTTPS et transmet à l'application |

---

## 2. « Un domaine non référencé » : ce que ça change

Un nom comme `marco.example.fr` peut exister de deux façons :

1. **Public** : n'importe qui sur Internet peut le résoudre. C'est ce qu'il faut
   pour Let's Encrypt.
2. **Interne seulement** : le DNS de l'école connaît le nom, Internet non. C'est
   parfaitement adapté à Marco : seuls les appareils du réseau de l'école
   peuvent ouvrir la page.

Le fait qu'un nom soit interne **n'empêche pas HTTPS**. Simplement, l'autorité
qui signe le certificat ne peut pas être Let's Encrypt (qui doit joindre le
serveur depuis Internet pour vérifier). On utilise alors :

- le certificat de l'école, s'il existe (recommandé) ;
- ou une autorité locale créée par Caddy, à installer sur les appareils.

C'est exactement l'objet de `MARCO_TLS_DIRECTIVE`.

---

## 3. Les deux flux réseau à ne pas confondre

```
Flux A : appareil client ──► serveur Marco        (entrant, port 443)
Flux B : serveur Marco   ──► MySQL Fouaille       (sortant, port 3306)
```

- **Flux A** : les téléphones, ordinateurs et tablettes doivent joindre le
  serveur en HTTPS. C'est le pare-feu *autour du serveur* qui doit autoriser
  l'entrée sur 443.
- **Flux B** : le serveur doit joindre la base Fouaille. C'est le pare-feu
  *autour de la base* (ou de son segment) qui doit autoriser le serveur.

Un déploiement peut très bien afficher la page (flux A OK) mais échouer à lire
les membres (flux B bloqué). Le diagnostic se fait avec :

```bash
curl -k https://marco.example.fr/ready     # flux B
mysql -h mysql.example.fr -P 3306 -u … -p -e "SELECT 1" BdeData
```

---

## 4. Ce qu'il faut demander au service informatique

Copiez-collez ce bloc dans un message :

> Bonjour,
>
> Nous déployons une application web interne (Marco Prime, caisse du BDE) sur
> un serveur Linux de l'école. Elle doit être accessible en HTTPS depuis les
> postes et téléphones du réseau pédagogique, et joindre la base MySQL Fouaille.
>
> Pourriez-vous nous confirmer ou fournir :
>
> 1. le nom de domaine à utiliser (par exemple `marco.example.fr`) et la
>    création de l'enregistrement DNS de type A vers l'adresse IP du serveur ;
> 2. l'autorisation des connexions entrantes TCP 443 (et TCP 80 pour la
>    redirection) depuis le réseau de l'école vers ce serveur ;
> 3. l'autorisation des connexions sortantes du serveur vers
>    `mysql.example.fr:3306` ;
> 4. un compte MySQL dédié à cette application, avec les droits nécessaires sur
>    la base `BdeData` ;
> 5. s'il existe un certificat TLS pour ce nom (wildcard `*.example.fr` ou
>    certificat dédié) que nous pourrions utiliser, ou à défaut la procédure
>    pour faire confiance à une autorité locale sur les appareils ;
> 6. la politique de sauvegarde des volumes Docker du serveur.
>
> Merci !

Les réponses se notent dans [CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md).

---

## 5. Comment fonctionne le HTTPS dans Marco

Caddy, le conteneur `https`, est le seul exposé. Il :

1. écoute sur 443 ;
2. présente un certificat pour `MARCO_API_DOMAIN` ;
3. transmet la requête à l'application (`app:3000`) sur le réseau interne Docker ;
4. ajoute des en-têtes de sécurité.

Trois sources de certificat possibles :

| `MARCO_TLS_DIRECTIVE` | Source | Prérequis | Avertissement navigateur |
|------------------------|--------|-----------|--------------------------|
| `tls /certs/fullchain.pem /certs/privkey.pem` | Certificat de l'école | Fichiers fournis | Non |
| `tls internal` | Autorité locale Caddy | Aucun | Oui, tant que l'autorité n'est pas installée |
| `tls votre-adresse@exemple.fr` | Let's Encrypt | DNS public + ports ouverts depuis Internet | Non |

### Pourquoi un avertissement avec `internal` ?

Un certificat n'est accepté que si son signataire est connu de l'appareil.
L'autorité locale de Caddy n'est connue de personne au départ. Il faut exporter
son certificat racine (`./server cert`) et l'installer une fois sur chaque
appareil. Ensuite, plus d'avertissement.

C'est acceptable pour quelques appareils maîtrisés (les tablettes du BDE). Pour
un usage large et anonyme (tous les étudiants), un certificat d'école est
préférable.

---

## 6. Le jeton d'API et la session administrateur

### Le jeton d'API

Le jeton `API_TOKEN` n'est **pas** envoyé au navigateur. Caddy l'ajoute lui-même
à chaque requête vers l'application :

```
navigateur ──requête sans jeton──► Caddy ──Authorization: Bearer …──► app
```

- **Ce qu'il protège** : l'API interne, qui n'est pas publiée directement. Un
  appareil du réseau qui contournerait Caddy et atteindrait `app:3000` serait
  refusé.
- **Ce qu'il ne protège pas** : quelqu'un qui ouvre l'URL publique, puisque
  Caddy ajoute le jeton pour lui. Ce n'est pas un mot de passe utilisateur.
- Il sert aussi à signer les sessions administrateur. Le changer invalide
  toutes les sessions en cours.

### La session administrateur

Les actions qui touchent à l'argent, aux membres, aux prix ou à la configuration
exigent une session signée :

1. l'administrateur scanne sa carte ;
2. il saisit le mot de passe de configuration ;
3. le serveur renvoie un jeton `X-Admin-Token` valable 30 minutes, lié à sa
   carte ;
4. chaque action sensible renvoie ce jeton.

Un numéro de carte seul ne suffit donc plus : il est visible dans les réponses
de recherche et peut être énuméré. Le mot de passe reste sur le serveur, haché.

### Ce qui reste ouvert sur le réseau

Les routes de caisse (recherche d'un membre, achat, rechargement, historique,
catalogue) sont accessibles à un appareil du réseau pour ne pas ralentir le
passage. **La vraie protection est donc l'accès réseau** :

1. le serveur n'est joignable que depuis le réseau de l'école ;
2. le HTTPS empêche l'écoute passive ;
3. la session administrateur protège les actions sensibles ;
4. les limites de débit et de taille de corps réduisent les abus.

Si un jour Marco doit être joignable depuis Internet, il faudra ajouter une
authentification par utilisateur (ou un VPN), pas seulement un jeton.

---

## 7. Vérifications utiles

Depuis un appareil client :

```bash
# Le nom résout-il ?
dig +short marco.example.fr

# Le port répond-il ?
nc -vz marco.example.fr 443

# Le certificat est-il valide et pour le bon nom ?
openssl s_client -connect marco.example.fr:443 -servername marco.example.fr </dev/null \
  | openssl x509 -noout -subject -issuer -dates

# La page et l'API répondent-elles ?
curl -s https://marco.example.fr/health
curl -s https://marco.example.fr/runtime-config.js
curl -s -o /dev/null -w '%{http_code}\n' https://marco.example.fr/api/v1/system/status
curl -s -o /dev/null -w '%{http_code}\n' https://marco.example.fr/ui
```

Résultats attendus :

| Commande | Attendu |
|----------|---------|
| `dig` | l'IP du serveur |
| `nc` | `succeeded` |
| `openssl` | `subject=CN = marco.example.fr`, dates valides |
| `/health` | `{"status":"ok"}` |
| `/runtime-config.js` | `window.MARCO_CONFIG = {"apiUrl":"/api/v1","deployment":"server","apiTokenInjected":true};` |
| API via l'URL publique | `200` : Caddy ajoute le jeton |
| `/ui` | `404` : documentation masquée |
| API directement dans le conteneur, sans jeton | `401` |

La dernière vérification se fait depuis le serveur :

```bash
docker compose -f compose.server.yml --env-file .env.server exec app \
  node -e "fetch('http://127.0.0.1:3000/api/v1/system/status').then(r=>console.log(r.status))"
```

---

## 8. Cas particuliers fréquents dans une école

### Proxy HTTP obligatoire

Si les navigateurs passent par un proxy, ajoutez le domaine en exception
(« ne pas utiliser de proxy pour `marco.example.fr` »). Sinon les requêtes
sortent et ne reviennent pas.

### Inspection TLS

Certains établissements déchiffrent le HTTPS pour le filtrer. Dans ce cas, le
certificat présenté aux clients est celui de l'école : il faut soit installer
l'autorité de l'école sur les appareils, soit demander une exception pour ce
domaine.

### Wi-Fi invité séparé

Si le Wi-Fi invité est isolé du réseau pédagogique, les téléphones invités ne
verront pas le serveur. C'est souvent souhaitable. Précisez au service
informatique quels réseaux doivent y accéder.

### Adresse IP changeante

Le serveur doit avoir une **IP fixe** (ou une réservation DHCP). Sinon
l'enregistrement DNS deviendra faux après un redémarrage.

### Nom déjà utilisé

Vérifiez que le nom choisi n'est pas déjà pris par un autre service. Un
`dig +short` qui renvoie une autre IP est un signal d'alerte.

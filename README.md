# Marco Prime Server

Version préparée pour séparer le backend et le kiosque Marco Prime.

- Le serveur de l’école conserve les identifiants Fouaille et expose l’API en HTTPS avec Caddy.
- Le Raspberry exécute uniquement le frontend statique et appelle cette API distante.
- Aucun identifiant MySQL n’est installé sur le Raspberry.

Les valeurs à demander et à remplacer sont détaillées dans [CONFIGURATION_A_REMPLIR.md](CONFIGURATION_A_REMPLIR.md).

## Serveur

```bash
./server check
nano .env.server
./server check
./server start
```

Le DNS doit pointer vers le serveur et les ports 80/443 doivent être accessibles pour que Caddy obtienne automatiquement le certificat HTTPS.

Le volume `marco_server_data` conserve la sélection du catalogue, les prix
d’achat, la comptabilité réelle et le journal des corrections. Il doit faire
partie de la sauvegarde du serveur : le perdre ferait notamment perdre la
protection locale contre une seconde correction d’une même vente.

## Raspberry / frontend

```bash
./frontend check
nano .env.frontend
./frontend check
./frontend start
```

Ouvrir ensuite `http://127.0.0.1:3001` dans Chromium.

Dans **Config**, l’administrateur dispose de :

- **Corrections** : remplacer le produit ou la quantité d’une vente, ou
  l’annuler totalement. Le remboursement et le remplacement sont réalisés
  dans une seule transaction MySQL ;
- **Compta** : saisir les litres réellement mesurés, le prix d’achat par litre
  et les recettes réelles. Le résultat est simplement `recettes - coût`, sans
  HT, TVA ni brut/net.

# Caisse

Logiciel de caisse de boutique, pour poste de vente. Application de bureau
Electron : **tout se passe sur le poste**, sans serveur ni connexion. Les
donnees vivent dans un fichier SQLite, la ou le systeme range les donnees
d'application de l'utilisateur.

Les montants sont en francs CFA, entiers : la monnaie n'a pas de subdivision.

## Ce que la caisse sait faire

| Ecran | Ce qu'on y fait |
| --- | --- |
| **Vente** | Chercher un article, remplir le panier, remise par ligne ou globale, encaisser en especes / mobile money / carte, rendre la monnaie, imprimer le ticket |
| **Articles** | Tenir le catalogue : reference, designation, prix TTC, taux de TVA, stock, seuil d'alerte |
| **Journal** | Les ventes de la journee, le ticket de chacune, l'annulation d'une vente (le stock revient) |
| **Cloture** | Le total du jour, ventile par mode de paiement et par taux de TVA |
| **Reglages** | Identite de la boutique (elle figure sur le ticket) et comptes utilisateurs |

Deux roles. Le **caissier** vend, consulte le catalogue et le journal.
L'**administrateur** fait tout cela, plus le catalogue, les annulations, les
comptes et les reglages. Le partage est tenu par le processus principal :
l'ecran masque les boutons inutiles, mais c'est le coeur qui refuse.

## Demarrer

```sh
npm install     # installe Electron et recompile better-sqlite3 pour lui
npm start
```

A la premiere ouverture, la caisse demande de creer le compte administrateur.
**Il n'y a pas de mot de passe par defaut** : rien n'est ouvert tant que ce
compte n'existe pas.

## Verifier

```sh
npm test        # 33 tests : monnaie, panier, ticket, base de donnees
npm run verifier # lance l'application, se connecte, encaisse une vente, capture l'ecran
```

`npm test` couvre le calcul, sans Electron. `npm run verifier` demarre
l'application pour de vrai sur une base jetable et verifie qu'elle se lance,
que le pont vers le rendu existe, que la connexion aboutit, que le total et la
monnaie s'affichent juste, que l'encaissement ecrit la vente et decompte le
stock. Il ecrit `verification-caisse.png` et `verification-ticket.png`.

## Comment c'est bati

```
src/
  metier/     calcul pur, sans Electron ni base : monnaie, panier, ticket, dates
  donnees/    schema SQLite et acces : articles, ventes, utilisateurs
  principal/  processus principal Electron : fenetre, canaux, impression, pont
  rendu/      l'interface, une page et quatre ecrans
tests/        node:test, sans dependance
```

Trois regles tiennent l'ensemble :

**Le calcul est separe de tout le reste.** `src/metier/` ne connait ni Electron
ni SQLite. C'est ce qui rend l'arrondi verifiable : la somme des lignes d'un
ticket fait exactement son total, et base HT + TVA fait exactement le TTC, sans
franc perdu. Les tests le prouvent taux par taux.

**L'ecran ne fait pas foi.** Le panier envoye a l'enregistrement ne porte que
des references et des quantites. Prix, taux de TVA, stock et total sont relus
et recalcules dans le processus principal. Une vente s'ecrit dans une seule
transaction : elle est entiere ou elle n'existe pas.

**Le rendu n'a pas les cles.** `contextIsolation` est actif, `nodeIntegration`
ne l'est pas : la page n'a ni `require`, ni acces au disque, ni `ipcRenderer`.
Elle ne voit que les fonctions listees dans `src/principal/passerelle.js`.
La session est tenue cote principal, une page ne peut pas se declarer
administrateur.

## Le ticket

Format 58 mm, 32 caracteres, texte a chasse fixe. L'apercu affiche a l'ecran
est produit par la fonction qui alimente l'imprimante : les deux ne peuvent pas
diverger.

```
          MA BOUTIQUE
================================
Ticket           V-20260828-0001
28/08/2026 20:56        Awa Kone
--------------------------------
Savon de Marseille
  2 x 325 F                650 F
Pain
  1 x 200 F                200 F
--------------------------------
TOTAL                      850 F

  HT 18 %                  551 F
  TVA 18 %                  99 F
  HT 0 %                   200 F
--------------------------------
Especes                  2 000 F
Monnaie rendue           1 150 F
```

## Raccourcis

| Touche | Effet |
| --- | --- |
| `F3` | Revenir au champ de recherche |
| `Entree` | Ajouter le premier article trouve |
| `F2` | Encaisser |
| `Echap` | Fermer la boite ouverte |

## Origine

Ce depot reprend le prototype [DiamondArt/caisse_gestion_desktop](https://github.com/DiamondArt/caisse_gestion_desktop),
conserve tel quel dans le premier commit. Le prototype ne demarrait pas :
il n'avait pas de `package.json`, son `app.on('ready')` etait en commentaire,
il ouvrait trois fenetres a la fois et s'appuyait sur `electron.remote`, retire
d'Electron depuis la version 14. Les maquettes d'origine sont dans `maquette/`.

# Caisse

Logiciel de caisse de boutique, pour poste de vente. Application de bureau
Electron : **tout se passe sur le poste**, sans serveur ni connexion. Les
donnees vivent dans un fichier SQLite, la ou le systeme range les donnees
d'application de l'utilisateur.

Les montants sont en francs CFA, entiers : la monnaie n'a pas de subdivision.

## Ce que la caisse sait faire

| Ecran | Ce qu'on y fait |
| --- | --- |
| **Vente** | Scanner ou chercher un article, remplir le panier, remise par ligne ou globale, encaisser en especes / mobile money / carte, rendre la monnaie, imprimer le ticket |
| **Articles** | Tenir le catalogue : reference, code-barres, designation, prix TTC, taux de TVA, stock, seuil d'alerte ; imprimer les etiquettes |
| **Journal** | Les ventes de la journee, le ticket de chacune, l'annulation d'une vente (le stock revient) |
| **Cloture** | Le total du jour, ventile par mode de paiement et par taux de TVA |
| **Reglages** | Identite de la boutique (elle figure sur le ticket) et comptes utilisateurs |

Deux roles. Le **caissier** vend, consulte le catalogue et le journal.
L'**administrateur** fait tout cela, plus le catalogue, les annulations, les
comptes et les reglages. Le partage est tenu par le processus principal :
l'ecran masque les boutons inutiles, mais c'est le coeur qui refuse.

## Demarrer

```sh
npm install
npm start
```

Aucune compilation native n'est necessaire : better-sqlite3 est livre en
Node-API, dont l'ABI vaut aussi bien pour Node que pour Electron. Il n'y a donc
ni node-gyp, ni Visual Studio Build Tools a installer sous Windows.

A la premiere ouverture, la caisse demande de creer le compte administrateur.
**Il n'y a pas de mot de passe par defaut** : rien n'est ouvert tant que ce
compte n'existe pas.

## Verifier

```sh
npm test        # 75 tests : monnaie, panier, ticket, codes-barres, etiquettes, migrations, base
npm run verifier # lance l'application, se connecte, encaisse une vente, capture l'ecran
```

Les deux tournent aussi a chaque poussee et sur chaque demande de fusion
(`.github/workflows/verification.yml`), et les captures y sont conservees en
piece jointe.

`npm test` couvre le calcul et la base, sans Electron. `npm run verifier` demarre
l'application pour de vrai sur une base jetable et verifie qu'elle se lance,
que le pont vers le rendu existe, que la connexion aboutit, qu'une lecture de
douchette remplit le panier la ou une frappe humaine lente ne le fait pas, que
le total et la monnaie s'affichent juste, que l'encaissement ecrit la vente et
decompte le stock, et qu'une planche d'etiquettes sort bien en PDF.

Il ecrit `verification-caisse.png`, `verification-ticket.png` et
`verification-etiquettes.png`.

## Comment c'est bati

```
src/
  metier/     calcul pur, sans Electron ni base : monnaie, panier, ticket,
              codes-barres et leur trace, planches d'etiquettes, dates
  donnees/    schema SQLite, migrations et acces : articles, ventes, utilisateurs
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

**La base se met a jour toute seule.** Le schema evolue par migrations
numerotees (`src/donnees/migrations.js`), et la base retient dans
`PRAGMA user_version` celle qu'elle a atteinte. Une caisse deja installee chez
un commerçant rattrape les etapes qui lui manquent a l'ouverture, sans perdre
ses ventes. Une migration publiee ne se modifie plus : un changement de schema
est une migration de plus.

**Le rendu n'a pas les cles.** `contextIsolation` est actif, `nodeIntegration`
ne l'est pas : la page n'a ni `require`, ni acces au disque, ni `ipcRenderer`.
Elle ne voit que les fonctions listees dans `src/principal/passerelle.js`.
La session est tenue cote principal, une page ne peut pas se declarer
administrateur.

## La douchette

Une douchette USB se presente au systeme comme un clavier : elle tape les
chiffres du code puis appuie sur Entree. Rien ne la distingue d'un humain, sauf
la vitesse — quelques millisecondes entre deux touches, la ou une main met des
dixiemes de seconde. C'est ce seul critere qui separe une lecture d'une saisie.

Il n'y a donc rien a installer ni a configurer : branchez la douchette, ouvrez
l'ecran de vente, scannez. L'article part au panier sans que le curseur soit
dans un champ, et une annonce confirme ce qui vient d'etre ajoute — le caissier
regarde ses articles, pas l'ecran.

Un code inconnu s'affiche tel quel. Si c'est l'administrateur qui scanne, la
caisse propose de creer l'article, code-barres deja rempli : c'est le geste de
la reception d'une livraison.

**Les cles de controle sont verifiees.** EAN-13, EAN-8 et UPC-A portent un
dernier chiffre calcule a partir des autres ; un code de cette longueur dont la
cle est fausse est refuse, avec le chiffre attendu. C'est ce qui attrape la
faute de frappe le jour ou la douchette est en panne et ou l'on saisit a la
main. Elle attrape toute inversion de deux chiffres voisins, a une exception
pres, qui tient au calcul : quand les deux chiffres different exactement de 5,
la somme ponderee ne bouge pas et la cle ne voit rien. Un test le verifie
plutot que de l'affirmer.
Les codes libres, sans longueur normalisee, sont acceptes tels quels — personne
ne peut en verifier la cle. Pour ce que la boutique etiquette elle-meme, mieux
vaut un code d'usage interne : voir plus bas.

Le code-barres reste facultatif : tout ce qu'une boutique vend n'en porte pas.

## Les etiquettes

Choisissez des articles dans le catalogue, et la caisse en imprime les
etiquettes : nom de la boutique, designation, code-barres et prix. Trois
formats, ceux qu'on trouve en papeterie, avec leurs marges reelles — une
etiquette se decolle d'une planche, et si la grille ne tombe pas juste, tout
est decale.

| Format | Grille |
| --- | --- |
| A4, 65 etiquettes | 38,1 x 21,2 mm, 5 colonnes sur 13 lignes |
| A4, 24 etiquettes | 63,5 x 33,9 mm, 3 colonnes sur 8 lignes |
| Rouleau | 40 x 30 mm, une par page |

**Les barres sont dessinees ici**, sans bibliotheque : l'application est hors
ligne et sa politique de securite du contenu interdit tout script exterieur.
Un chiffre occupe sept modules, encadres par des marques de garde ; en EAN-13,
le premier chiffre n'est pas dessine, il se lit dans l'alternance de parite des
six suivants — c'est ce qui fait tenir treize chiffres dans la place de douze.

Le code ne garde que la table L. La table R en est le complement, la table G le
miroir de R : deux tables recopiees de moins, donc deux occasions de faute en
moins. Un test compare les tables derivees a celles de la norme, un autre relit
les barres avec un decodeur ecrit separement et verifie qu'il retrouve le code
de depart sur des codes reellement imprimes sur des produits.

### Ce que la boutique etiquette elle-meme

Les beignets du matin, le riz vendu au kilo, la marchandise sans emballage : il
n'existe pour eux aucun code de fabricant. La norme reserve a ce cas les EAN-13
commençant par **2**, dits d'usage interne. Le bouton *Attribuer un code
interne*, dans la fiche d'un article, en pose un : la caisse tient un compteur
et saute les numeros deja pris, y compris ceux d'un catalogue repris d'ailleurs.

Un code ainsi attribue est un EAN-13 complet, cle comprise. Il s'imprime comme
les autres et se lit avec n'importe quelle douchette, sans jamais rencontrer le
code d'un fabricant.

### Codes libres

Une suite de chiffres sans longueur normalisee — relevee a la main, heritee
d'un ancien logiciel — est acceptee pour la douchette, mais **ne se dessine
pas** : aucune norme ne dit comment la tracer. Un tel article est ecarte de la
planche et signale, plutot que d'imprimer une etiquette illisible. La fiche
propose alors d'attribuer un code interne.

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
| *(scanner)* | Ajouter l'article lu au panier, ou qu'en soit le curseur |
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

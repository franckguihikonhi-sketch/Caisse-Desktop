# Ivoire-Gestion

Logiciel de caisse de boutique, pour poste de vente. Application de bureau
Electron : **tout fonctionne sans Internet**. Par defaut les donnees vivent dans
un fichier SQLite local, la ou Windows range les donnees d'application de
l'utilisateur. En mode reseau local, plusieurs postes Windows peuvent aussi
pointer vers le meme fichier `caisse.db` place dans un dossier partage/NAS de la
boutique.

Les montants sont en francs CFA, entiers : la monnaie n'a pas de subdivision.

## Ce que la caisse sait faire

| Ecran | Ce qu'on y fait |
| --- | --- |
| **Tableau de bord** | Suivre l'etat de la caisse, le chiffre d'affaires et la marge du jour/mois, les encaissements, les creances clients, les dettes fournisseurs, la valeur du stock et les alertes de stock |
| **Vente** | Scanner ou chercher un article, remplir le panier, remise par ligne ou globale, encaisser en especes / mobile money / carte, vendre a credit a un client, rendre la monnaie, imprimer le ticket thermique et exporter une facture A4 PDF |
| **Achats** | Receptionner les achats de marchandise fournisseur, saisir pieces ou cartons, facture/bon, paiement comptant ou credit, mettre le stock a jour automatiquement, creer la dette fournisseur et gerer les retours chez fournisseur |
| **Benefices** | Choisir une facture d'achat dans un menu deroulant et mettre en evidence, facture par facture, le benefice obtenu sur chaque article uniquement lorsque cet article a ete vendu |
| **Exports** | Depuis Reglages, exporter des fichiers Excel/CSV : articles/stock, ventes du jour, mouvements de stock, creances clients, dettes fournisseurs et benefices par facture |
| **Stock** | Visualiser le stock restant de chaque article, en pieces et en cartons, voir les ruptures, les alertes de seuil, les mouvements par article et valider un inventaire physique correcteur |
| **Articles** | Tenir le catalogue : reference, codes-barres piece/carton, designation, prix d'achat, prix de vente piece et carton, taux de TVA, stock en pieces, seuil d'alerte ; enregistrer des entrees/sorties/corrections de stock tracees ; imprimer les etiquettes |
| **Clients & credits** | Tenir le fichier client, fixer un plafond de credit, enregistrer une creance anterieure, suivre les creances ouvertes et encaisser les reglements |
| **Fournisseurs** | Tenir le fichier fournisseur, saisir les dettes anterieures, suivre les soldes a payer et enregistrer les reglements fournisseur |
| **Roles & permissions** | Creer des comptes Administrateur, Gerant, Caissier, Stock/Achats ou Comptable ; chaque ecran et chaque action critique sont verifies cote processus principal |
| **Audit** | Consulter l'historique horodate des connexions, ventes, annulations, retours, achats, stock, reglements, exports, sauvegardes et changements de comptes |
| **Caisse** | Ouvrir la caisse avec un fond, bloquer les ventes si elle est fermee, voir le journal du jour, gerer les retours clients, annuler une vente avec motif obligatoire, fermer avec calcul theorique et ecart |
| **Reglages** | Identite de la boutique, comptes utilisateurs, changement des mots de passe, sauvegarde automatique/manuelle, restauration de sauvegarde, choix de la base locale ou partagee en reseau local |

Le tableau de bord est pense pour le proprietaire : il separe les ventes du jour
et du mois, montre le benefice reel calcule sur les prix d'achat, la valeur du
stock au cout d'achat et au prix de vente, la marge potentielle encore en rayon,
les credits clients, les dettes fournisseurs et le net a encaisser/a payer.

L'interface suit une charte Ivoire-Gestion harmonisee orange-blanc-vert : barre
laterale sombre, cartes nettes, formulaires lisibles, boutons arrondis,
indicateurs colores, focus visible et tableaux homogènes sur tous les onglets.

Deux roles. Le **caissier** vend, consulte le catalogue et le journal.
L'**administrateur** fait tout cela, plus le catalogue, les annulations, les
comptes et les reglages. Le partage est tenu par le processus principal :
l'ecran masque les boutons inutiles, mais c'est le coeur qui refuse.

## Demarrer

```sh
npm install
npm start
```

Aucune compilation native n'est necessaire : la base SQLite passe par
`node:sqlite`, fourni par Node et Electron. Il n'y a donc ni node-gyp, ni
Visual Studio Build Tools a installer sous Windows.

A la premiere ouverture, connectez-vous avec l'acces standard :

```text
Nom d'utilisateur : CIV
Mot de passe      : CIV
```

Cet acces est un compte administrateur technique de depart. Chaque entreprise
doit ensuite changer ce mot de passe dans l'application, puis creer ses propres
utilisateurs si necessaire. Les mots de passe ne sont jamais stockes en clair.

## Roles et permissions

Ivoire-Gestion verifie les permissions dans le processus principal : masquer un
bouton ne suffit jamais, l'action est aussi refusee cote application. Les profils
disponibles sont :

| Role | Usage |
| --- | --- |
| **Administrateur** | Acces total : utilisateurs, base, sauvegardes, reseau, reglages et toutes les operations |
| **Gerant** | Ventes, annulations/retours, caisse, achats, stock, clients, fournisseurs, benefices et exports, sans gestion des comptes ni de la base systeme |
| **Caissier** | Encaissement, ouverture/fermeture de caisse, journal, clients et reglements clients ; pas d'annulation critique ni d'achat |
| **Stock / achats** | Articles, achats, fournisseurs, mouvements de stock et retours fournisseur ; pas d'encaissement client |
| **Comptable** | Journal, creances, dettes, reglements, benefices et exports ; pas de vente ni de modification du stock |

## Audit et historique

L'onglet **Audit** est reserve aux profils autorises. Il trace les connexions,
les refus de connexion, les ventes, retours et annulations, les achats, les
mouvements de stock, les creations/modifications de tiers et articles, les
reglements, les exports, les sauvegardes/restaurations et les changements de
comptes. Chaque ligne garde la date, l'utilisateur, son role, l'action, l'entite
concernee et un resume lisible.

## Actions critiques securisees

Les annulations de ventes, achats, retours clients/fournisseurs, les corrections
directes de stock et les restaurations de sauvegarde exigent un motif non vide.
Le motif est conserve dans la ligne metier concernee et/ou dans le journal audit,
afin que le proprietaire puisse comprendre qui a fait quoi, quand et pourquoi.

## Inventaire physique

Depuis l'onglet **Stock**, les profils autorises peuvent lancer **Inventaire
physique**. L'ecran affiche le stock theorique de chaque article ; l'utilisateur
saisit le stock reel compte en pieces. A la validation, Ivoire-Gestion cree un
document `INV-...`, enregistre chaque ligne comptee, applique automatiquement les
ecarts par mouvements de stock de type ajustement et laisse une trace dans
l'audit.

## Creer un executable Windows installable

Depuis un poste Windows de developpement connecte a Internet, double-cliquez sur
`scripts\\build-windows.cmd`, ou creez l'installateur et la version portable avec :

```sh
npm install
npm run electron:install
npm run dist:windows
```

Les fichiers sortent dans le dossier `release/` sous les noms
`Ivoire-Gestion-Setup-...exe` et `Ivoire-Gestion-Portable-...exe`, avec l'icone
Ivoire-Gestion. Un workflow GitHub Actions **Build Windows** fabrique aussi ces
executables automatiquement sur la branche Arena et les publie en artefacts.
Une fois installee sur Windows, l'application n'a pas besoin d'Internet pour
vendre, acheter, imprimer ou travailler sur sa base. L'executable n'embarque
aucune base commerciale : aucun article, client, fournisseur, vente, achat,
stock ou dette n'est precharge.

Le dossier technique des donnees reste volontairement `caisse-desktop` afin de
conserver les bases deja installees, meme si le nom visible de l'application est
`Ivoire-Gestion`.

## Installation dans plusieurs entreprises

L'installateur ne contient pas une base commune et ne se connecte a aucun serveur
central. Par defaut, chaque installation utilise sa propre base locale sur le
poste Windows ou l'application est installee :

```text
%APPDATA%\\caisse-desktop\\donnees\\caisse.db
```

Donc deux entreprises differentes n'ont aucun conflit de donnees : chacune garde
ses articles, ventes, clients, stocks, achats, dettes et reglages sur ses propres
postes. La base n'est partagee que si l'administrateur choisit volontairement un
dossier reseau dans les reglages.

## Sauvegarder les donnees

Ivoire-Gestion cree automatiquement une sauvegarde de la base une fois par jour
au demarrage et conserve les sauvegardes automatiques les plus recentes dans
`Documents\\Ivoire-Gestion\\sauvegardes-automatiques`.

Dans **Reglages > Base de donnees et reseau local**, le bouton **Sauvegarder la
base** cree aussi une copie complete du fichier `caisse.db` dans le dossier choisi
(par defaut `Documents\\Ivoire-Gestion\\sauvegardes`). Le bouton **Restaurer une
sauvegarde** permet de choisir un fichier `.db` : l'application sauvegarde d'abord
la base actuelle, remplace la base active, puis redemarre. Faites une sauvegarde
manuelle avant une mise a jour, un changement de poste ou le passage en base
partagee.

## Exporter pour Excel et les archives PDF

Dans **Reglages > Base de donnees et reseau local**, le bouton **Exporter
Excel/CSV** cree un dossier horodate dans `Documents\\Ivoire-Gestion\\exports`.
Les fichiers `.csv` s'ouvrent directement dans Excel sur Windows et couvrent les
articles/stock, ventes du jour, mouvements de stock, creances clients, dettes
fournisseurs et benefices par facture. Les ventes peuvent aussi sortir en
**Ticket PDF** ou en **Facture A4 PDF** depuis la confirmation de vente ou le
journal.

## Travailler en reseau local, sans Internet

Pour partager la meme base entre plusieurs postes :

1. Creer un dossier partage sur un poste principal ou un NAS, par exemple
   `\\SERVEUR\\Ivoire-Gestion`.
2. Donner aux postes de caisse le droit de lecture/ecriture sur ce dossier.
3. Dans Ivoire-Gestion, ouvrir **Reglages > Base de donnees et reseau local**.
4. Cliquer **Utiliser un dossier partage**, choisir le dossier, puis redemarrer
   l'application.
5. Refaire l'operation sur chaque poste : tous utiliseront le meme fichier
   `caisse.db`.

Si `caisse.db` n'existe pas encore dans le dossier partage, la base actuelle du
poste est copiee automatiquement. Si le fichier existe deja, le poste se branche
sur cette base existante. Avant de configurer le partage, Ivoire-Gestion teste
l'ecriture/lecture dans le dossier choisi. Le bouton **Tester acces reseau**
relance aussi ce controle et verifie l'integrite SQLite.

En mode reseau local, le journal SQLite passe en mode classique, la
synchronisation disque est forcee en mode sur, le verrouillage reste normal et un
delai d'attente de verrou est applique pour que deux caisses qui ecrivent en meme
temps patientent au lieu de corrompre les donnees.

Ce mode n'utilise pas Internet. Il exige seulement que les postes voient le meme
partage Windows local ; si le reseau local ou le poste qui partage le dossier est
eteint, les autres postes ne peuvent pas acceder a cette base partagee.

## Verifier

```sh
npm test        # tests : monnaie, panier, ticket, codes-barres, etiquettes, migrations, base
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
  rendu/      l'interface, une page et les ecrans metier
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

**La base se met a jour toute seule, avec sauvegarde de securite.** Le schema
evolue par migrations numerotees (`src/donnees/migrations.js`), et la base
retient dans `PRAGMA user_version` celle qu'elle a atteinte. Une caisse deja
installee chez un commerçant rattrape les etapes qui lui manquent a l'ouverture,
sans perdre ses ventes. Avant de migrer une base existante, Ivoire-Gestion cree
automatiquement une copie coherente dans `sauvegardes-auto`, puis controle
l'integrite SQLite. Une migration publiee ne se modifie plus : un changement de
schema est une migration de plus.

**La caisse est stricte.** Une vente lancee depuis l'interface exige une session
de caisse ouverte. Les ventes a credit creent automatiquement une creance client
et respectent le plafond de credit. Les achats de marchandise creent une dette
fournisseur ; s'ils sont payes comptant, la caisse doit etre ouverte et le
reglement fournisseur sort de la caisse. Les creances ou dettes qui existaient
avant l'application se saisissent separement pour demarrer avec des soldes
justes. Chaque entree, sortie, retour ou correction de stock passe par le
journal des mouvements : le stock ne peut jamais devenir negatif. Le stock est
tenu dans l'unite minimale, la **piece**. Un article peut aussi se vendre ou
s'acheter en **carton** (1 carton = N pieces, prix et code-barres carton
possibles) : vendre 2 cartons de 50 pieces retire exactement 100 pieces,
acheter 2 cartons en ajoute exactement 100, retourner de la marchandise chez le
fournisseur retire exactement les pieces du stock et diminue la dette ouverte ;
si l'achat etait deja paye, le montant reste trace comme avoir fournisseur.
Un retour client fait l'inverse d'une vente : les pieces reviennent en stock,
la creance client est diminuee si la vente etait a credit, sinon le retour est
trace en avoir client ou en remboursement. Annuler une vente, un achat ou un
retour fait le mouvement inverse, et toute sortie carton est refusee s'il ne
reste pas assez de pieces.

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
diverger. Pour une vente a credit, le pied du ticket ajoute automatiquement la
liste des factures credit encore ouvertes du client et le total restant du.

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

       Merci de votre visite
            A bientot
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

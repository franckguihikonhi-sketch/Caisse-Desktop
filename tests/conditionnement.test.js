'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const ventes = require('../src/donnees/ventes');
const stocks = require('../src/donnees/stocks');
const caisse = require('../src/donnees/caisse');
const codeBarres = require('../src/metier/code-barres');

test('un article vendu en cartons et pieces decompte toujours le stock en pieces', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  caisse.ouvrir(base, { fondOuverture: 0, utilisateurId: admin.id });

  const codePiece = codeBarres.construireCodeInterne(100);
  const codeCarton = codeBarres.construireCodeInterne(101);
  const article = articles.creer(base, {
    reference: 'BIS-50',
    designation: 'Biscuits sachet',
    prixUnitaire: 100,
    prixCarton: 4500,
    piecesParCarton: 50,
    stock: 120,
    seuilAlerte: 20,
    codeBarres: codePiece,
    codeBarresCarton: codeCarton,
  });

  assert.equal(article.stock, 120);
  assert.equal(article.stockLibelle, '2 cartons + 20 pieces');
  assert.equal(articles.lireParCodeBarres(base, codeCarton).uniteScannee, 'carton');

  const vente = ventes.enregistrer(base, {
    lignes: [
      { reference: 'BIS-50', quantite: 2, uniteVente: 'carton' },
      { reference: 'BIS-50', quantite: 10, uniteVente: 'piece' },
    ],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
    exigerCaisse: true,
  });

  assert.equal(vente.panier.totalTtc, 10000);
  assert.equal(articles.lireParReference(base, 'BIS-50').stock, 10);

  const relue = ventes.lire(base, vente.id);
  assert.deepEqual(relue.panier.lignes.map((l) => [l.uniteVente, l.quantite, l.facteurStock, l.quantiteStock]), [
    ['carton', 2, 50, 100],
    ['piece', 10, 1, 10],
  ]);

  assert.throws(() => ventes.enregistrer(base, {
    lignes: [{ reference: 'BIS-50', quantite: 1, uniteVente: 'carton' }],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
    exigerCaisse: true,
  }), /Stock insuffisant/);

  stocks.mouvement(base, {
    articleId: article.id,
    type: 'entree',
    unite: 'carton',
    quantite: 3,
    motif: 'Livraison carton',
    utilisateurId: admin.id,
  });
  assert.equal(articles.lireParReference(base, 'BIS-50').stock, 160);

  const mouvement = stocks.lister(base, { articleId: article.id })[0];
  assert.equal(mouvement.uniteMouvement, 'carton');
  assert.equal(mouvement.facteurStock, 50);
  assert.equal(mouvement.quantite, 150);
});

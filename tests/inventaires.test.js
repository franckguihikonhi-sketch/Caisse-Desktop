'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const inventaires = require('../src/donnees/inventaires');
const stocks = require('../src/donnees/stocks');

test('un inventaire physique applique les ecarts et trace les corrections', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.authentifier(base, 'CIV', 'CIV');
  const savon = articles.creer(base, { reference: 'INV-SAV', designation: 'Savon inventaire', prixUnitaire: 500, stock: 10 });
  const riz = articles.creer(base, { reference: 'INV-RIZ', designation: 'Riz inventaire', prixUnitaire: 2000, stock: 8 });

  const preparation = inventaires.preparer(base);
  assert.ok(preparation.some((ligne) => ligne.reference === 'INV-SAV' && ligne.stockTheorique === 10));

  const inv = inventaires.enregistrer(base, {
    utilisateurId: admin.id,
    note: 'Inventaire rayon A',
    lignes: [
      { articleId: savon.id, stockCompte: 12 },
      { articleId: riz.id, stockCompte: 5 },
    ],
  });

  assert.match(inv.numero, /^INV-\d{8}-001$/);
  assert.equal(inv.totalLignes, 2);
  assert.equal(inv.totalEcarts, 5);
  assert.equal(articles.lireParId(base, savon.id).stock, 12);
  assert.equal(articles.lireParId(base, riz.id).stock, 5);

  const mouvements = stocks.lister(base, { limite: 10 });
  assert.equal(mouvements.filter((m) => m.reference === inv.numero).length, 2);
  assert.equal(inventaires.lister(base)[0].numero, inv.numero);
});

test('un inventaire refuse les comptes negatifs et les doublons', () => {
  const base = ouvrir(':memory:');
  const article = articles.creer(base, { reference: 'INV-ERR', designation: 'Erreur inventaire', prixUnitaire: 100, stock: 1 });

  assert.throws(() => inventaires.enregistrer(base, {
    lignes: [{ articleId: article.id, stockCompte: -1 }],
  }), /stock compte/);

  assert.throws(() => inventaires.enregistrer(base, {
    lignes: [
      { articleId: article.id, stockCompte: 1 },
      { articleId: article.id, stockCompte: 2 },
    ],
  }), /une fois/);
});

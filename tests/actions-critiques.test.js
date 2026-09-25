'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const fournisseurs = require('../src/donnees/fournisseurs');
const caisse = require('../src/donnees/caisse');
const ventes = require('../src/donnees/ventes');
const achats = require('../src/donnees/achats');
const stocks = require('../src/donnees/stocks');

function contexte() {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  return { base, admin };
}

test('une annulation de vente exige un motif et ne modifie rien sans motif', () => {
  const { base, admin } = contexte();
  articles.creer(base, { reference: 'ANN-V', designation: 'Article annulation vente', prixUnitaire: 1000, stock: 3 });
  caisse.ouvrir(base, { fondOuverture: 0, utilisateurId: admin.id });
  const vente = ventes.enregistrer(base, {
    lignes: [{ reference: 'ANN-V', quantite: 1 }],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
  });

  assert.throws(() => ventes.annuler(base, vente.id, '   ', admin.id), /motif obligatoire/);
  assert.equal(ventes.lire(base, vente.id).annulee, false);
  assert.equal(articles.lireParReference(base, 'ANN-V').stock, 2);
});

test('une annulation achat exige un motif historique', () => {
  const { base, admin } = contexte();
  const fournisseur = fournisseurs.creer(base, { nom: 'Fournisseur critique' });
  const article = articles.creer(base, { reference: 'ANN-A', designation: 'Article annulation achat', prixUnitaire: 800, stock: 0 });
  const achat = achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [{ articleId: article.id, quantite: 2, prixAchatUnitaire: 500 }],
  });

  assert.throws(() => achats.annuler(base, achat.id, '', admin.id), /motif obligatoire/);
  assert.equal(achats.lire(base, achat.id).statut, 'valide');
  assert.equal(articles.lireParReference(base, 'ANN-A').stock, 2);
});

test('une correction directe de stock exige un motif', () => {
  const { base, admin } = contexte();
  const article = articles.creer(base, { reference: 'STK-MOTIF', designation: 'Article stock motif', prixUnitaire: 500, stock: 4 });

  assert.throws(() => stocks.fixerStock(base, {
    articleId: article.id,
    nouveauStock: 6,
    motif: ' ',
    utilisateurId: admin.id,
  }), /motif obligatoire/);
  assert.equal(articles.lireParReference(base, 'STK-MOTIF').stock, 4);

  const mouvement = stocks.fixerStock(base, {
    articleId: article.id,
    nouveauStock: 6,
    motif: 'Comptage responsable',
    utilisateurId: admin.id,
  });
  assert.equal(mouvement.motif, 'Comptage responsable');
  assert.equal(articles.lireParReference(base, 'STK-MOTIF').stock, 6);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const fournisseurs = require('../src/donnees/fournisseurs');
const caisse = require('../src/donnees/caisse');
const achats = require('../src/donnees/achats');
const stocks = require('../src/donnees/stocks');

test('un achat fournisseur ajoute le stock et cree la dette exacte', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Grossiste Abidjan' });
  const article = articles.creer(base, {
    reference: 'LAIT-12', designation: 'Lait pack', prixUnitaire: 700,
    piecesParCarton: 12, prixCarton: 7800, stock: 0,
  });

  const achat = achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    dateAchat: '2026-09-22',
    referenceDocument: 'FAC-7788',
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [
      { articleId: article.id, uniteAchat: 'carton', quantite: 2, prixAchatUnitaire: 6000 },
      { articleId: article.id, uniteAchat: 'piece', quantite: 3, prixAchatUnitaire: 550 },
    ],
  });

  assert.match(achat.numero, /^ACH-20260922-/);
  assert.equal(achat.totalTtc, 13650);
  assert.equal(articles.lireParReference(base, 'LAIT-12').stock, 27);

  const dette = fournisseurs.listerDettes(base, { fournisseurId: fournisseur.id })[0];
  assert.equal(dette.solde, 13650);
  assert.equal(dette.libelle, 'Achat marchandise ' + achat.numero);

  const relu = achats.lire(base, achat.id);
  assert.deepEqual(relu.lignes.map((l) => [l.uniteAchat, l.quantite, l.facteurStock, l.quantiteStock]), [
    ['carton', 2, 12, 24],
    ['piece', 3, 1, 3],
  ]);

  const mouvements = stocks.lister(base, { articleId: article.id, limite: 10 });
  assert.equal(mouvements.filter((m) => m.achatId === achat.id).length, 2);
  assert.equal(mouvements[0].reference, 'FAC-7788');
});

test('un achat comptant exige une caisse ouverte et sort les especes', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Depot Central' });
  const article = articles.creer(base, { reference: 'HUILE', designation: 'Huile', prixUnitaire: 1200, stock: 0 });

  assert.throws(() => achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    modeReglement: 'especes',
    utilisateurId: admin.id,
    lignes: [{ articleId: article.id, uniteAchat: 'piece', quantite: 5, prixAchatUnitaire: 800 }],
  }), /caisse n'est pas ouverte/);
  assert.equal(articles.lireParReference(base, 'HUILE').stock, 0);

  caisse.ouvrir(base, { fondOuverture: 10000, utilisateurId: admin.id });
  const achat = achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    modeReglement: 'especes',
    utilisateurId: admin.id,
    lignes: [{ articleId: article.id, uniteAchat: 'piece', quantite: 5, prixAchatUnitaire: 800 }],
  });

  assert.equal(articles.lireParReference(base, 'HUILE').stock, 5);
  assert.equal(fournisseurs.lire(base, fournisseur.id).solde, 0);
  assert.equal(fournisseurs.listerDettes(base, { fournisseurId: fournisseur.id, inclureReglees: true })[0].statut, 'reglee');
  assert.equal(caisse.etat(base).resume.totalTheorique, 6000, 'fond 10000 - achat especes 4000');
  assert.equal(achats.lire(base, achat.id).detteStatut, 'reglee');
});

test('annuler un achat credit retire le stock et annule la dette si rien n a ete paye', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Annulable SARL' });
  const article = articles.creer(base, { reference: 'SUCRE', designation: 'Sucre', prixUnitaire: 900, stock: 0 });

  const achat = achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [{ articleId: article.id, quantite: 10, prixAchatUnitaire: 600 }],
  });
  assert.equal(articles.lireParReference(base, 'SUCRE').stock, 10);

  const annule = achats.annuler(base, achat.id, 'Erreur de saisie', admin.id);
  assert.equal(annule.statut, 'annule');
  assert.equal(articles.lireParReference(base, 'SUCRE').stock, 0);
  assert.equal(fournisseurs.listerDettes(base, { fournisseurId: fournisseur.id, inclureReglees: true })[0].statut, 'annulee');
});

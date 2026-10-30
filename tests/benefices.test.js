'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const fournisseurs = require('../src/donnees/fournisseurs');
const caisse = require('../src/donnees/caisse');
const achats = require('../src/donnees/achats');
const ventes = require('../src/donnees/ventes');
const benefices = require('../src/donnees/benefices');

test('le rapport benefices affiche seulement les articles achetes puis vendus', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Grossiste Profit' });
  const vendu = articles.creer(base, { reference: 'VENDU', designation: 'Article vendu', prixUnitaire: 1500, stock: 0 });
  const nonVendu = articles.creer(base, { reference: 'DORMANT', designation: 'Article dormant', prixUnitaire: 900, stock: 0 });

  const achat = achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    dateAchat: '2026-09-20',
    referenceDocument: 'FAC-PROFIT',
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [
      { articleId: vendu.id, uniteAchat: 'piece', quantite: 10, prixAchatUnitaire: 1000 },
      { articleId: nonVendu.id, uniteAchat: 'piece', quantite: 5, prixAchatUnitaire: 600 },
    ],
  });

  caisse.ouvrir(base, { fondOuverture: 0, utilisateurId: admin.id });
  ventes.enregistrer(base, {
    lignes: [{ reference: 'VENDU', quantite: 3 }],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
  });

  const rapport = benefices.lister(base);
  assert.equal(rapport.facturesDisponibles.length, 1);
  assert.equal(rapport.facturesDisponibles[0].id, achat.id);
  assert.equal(rapport.resume.factures, 1);
  assert.equal(rapport.resume.lignes, 1);
  assert.equal(rapport.resume.chiffreAffaires, 4500);
  assert.equal(rapport.resume.coutAchat, 3000);
  assert.equal(rapport.resume.benefice, 1500);
  assert.equal(rapport.resume.margePourcent, 33.3);

  assert.equal(rapport.factures[0].achatId, achat.id);
  assert.equal(rapport.factures[0].numero, achat.numero);
  assert.equal(rapport.factures[0].lignes.length, 1);
  assert.equal(rapport.factures[0].lignes[0].reference, 'VENDU');
  assert.equal(rapport.factures[0].lignes[0].quantiteStockVendue, 3);
  assert.equal(rapport.factures[0].lignes[0].benefice, 1500);
});

test('le rapport benefices peut etre limite a une facture choisie', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Grossiste Selection' });
  const articleA = articles.creer(base, { reference: 'SEL-A', designation: 'Article selection A', prixUnitaire: 2000, stock: 0 });
  const articleB = articles.creer(base, { reference: 'SEL-B', designation: 'Article selection B', prixUnitaire: 3000, stock: 0 });

  const achatVendu = achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    dateAchat: '2026-09-20',
    referenceDocument: 'FAC-VENDUE',
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [{ articleId: articleA.id, uniteAchat: 'piece', quantite: 4, prixAchatUnitaire: 1200 }],
  });
  const achatSansVente = achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    dateAchat: '2026-09-21',
    referenceDocument: 'FAC-NON-VENDUE',
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [{ articleId: articleB.id, uniteAchat: 'piece', quantite: 4, prixAchatUnitaire: 1800 }],
  });

  caisse.ouvrir(base, { fondOuverture: 0, utilisateurId: admin.id });
  ventes.enregistrer(base, {
    lignes: [{ reference: 'SEL-A', quantite: 2 }],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
  });

  const global = benefices.lister(base);
  assert.deepEqual(new Set(global.facturesDisponibles.map((f) => f.id)), new Set([achatVendu.id, achatSansVente.id]));
  assert.equal(global.factures.length, 1);
  assert.equal(global.factures[0].achatId, achatVendu.id);

  const selectionVendue = benefices.lister(base, { achatId: achatVendu.id });
  assert.equal(selectionVendue.selection.achatId, achatVendu.id);
  assert.equal(selectionVendue.factures.length, 1);
  assert.equal(selectionVendue.factures[0].numero, achatVendu.numero);
  assert.equal(selectionVendue.resume.benefice, 1600);

  const selectionSansVente = benefices.lister(base, { achatId: achatSansVente.id });
  assert.equal(selectionSansVente.selection.achatId, achatSansVente.id);
  assert.equal(selectionSansVente.factures.length, 0);
  assert.equal(selectionSansVente.resume.lignes, 0);
  assert.deepEqual(new Set(selectionSansVente.facturesDisponibles.map((f) => f.id)), new Set([achatVendu.id, achatSansVente.id]));
});

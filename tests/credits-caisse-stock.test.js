'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const ventes = require('../src/donnees/ventes');
const clients = require('../src/donnees/clients');
const fournisseurs = require('../src/donnees/fournisseurs');
const caisse = require('../src/donnees/caisse');
const stocks = require('../src/donnees/stocks');

test('vente a credit, creance client et fermeture de caisse restent coherentes', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const client = clients.creer(base, { nom: 'Client Pro', plafondCredit: 1000 });
  articles.creer(base, { reference: 'EAU', designation: 'Eau minerale', prixUnitaire: 300, stock: 5 });
  const detteAvant = clients.creerCreanceAnterieure(base, {
    clientId: client.id,
    montantInitial: 150,
    libelle: 'Facture avant installation',
  });

  assert.throws(() => ventes.enregistrer(base, {
    lignes: [{ reference: 'EAU', quantite: 1 }],
    paiement: { mode: 'carte' }, utilisateurId: admin.id, exigerCaisse: true,
  }), /caisse n'est pas ouverte/);

  caisse.ouvrir(base, { fondOuverture: 500, utilisateurId: admin.id });
  const vente = ventes.enregistrer(base, {
    lignes: [{ reference: 'EAU', quantite: 2 }],
    paiement: { mode: 'credit' }, clientId: client.id, utilisateurId: admin.id, exigerCaisse: true,
  });

  const venteRelue = ventes.lire(base, vente.id);
  assert.equal(venteRelue.paiement.mode, 'credit');
  assert.equal(articles.lireParReference(base, 'EAU').stock, 3);
  const creancesOuvertes = clients.listerCreances(base, { clientId: client.id });
  assert.equal(creancesOuvertes.length, 2);
  assert.equal(creancesOuvertes.reduce((s, c) => s + c.solde, 0), 750);
  assert.equal(venteRelue.creditClient.totalSolde, 750);
  assert.deepEqual(venteRelue.creditClient.factures.map((f) => f.solde), [detteAvant.solde, 600]);
  assert.ok(venteRelue.creditClient.factures.some((f) => f.numero === vente.numero));

  clients.enregistrerReglement(base, {
    creanceId: clients.listerCreances(base, { clientId: client.id })[0].id,
    montant: 200,
    modePaiement: 'especes',
    utilisateurId: admin.id,
  });

  const fermee = caisse.fermer(base, { fondFermeture: 700, utilisateurId: admin.id });
  assert.equal(fermee.totalTheorique, 700, 'fond 500 + reglement client especes 200, vente credit exclue');
  assert.equal(fermee.ecart, 0);
});

test('stock journalise et dettes fournisseurs se reglent strictement', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Grossiste Central' });
  const article = articles.creer(base, { reference: 'RIZ', designation: 'Riz', prixUnitaire: 500, stock: 1 });

  stocks.mouvement(base, {
    articleId: article.id,
    type: 'entree',
    quantite: 9,
    motif: 'Livraison',
    fournisseurId: fournisseur.id,
    utilisateurId: admin.id,
  });
  assert.equal(articles.lireParReference(base, 'RIZ').stock, 10);
  assert.throws(() => stocks.mouvement(base, {
    articleId: article.id, type: 'sortie', quantite: 99, motif: 'Perte', utilisateurId: admin.id,
  }), /Stock insuffisant/);
  assert.equal(stocks.lister(base, { articleId: article.id }).length, 2);

  const dette = fournisseurs.creerDetteAnterieure(base, {
    fournisseurId: fournisseur.id,
    montantInitial: 4000,
    libelle: 'Facture avant installation',
  });
  caisse.ouvrir(base, { fondOuverture: 5000, utilisateurId: admin.id });
  fournisseurs.enregistrerReglement(base, {
    detteId: dette.id,
    montant: 1500,
    modePaiement: 'especes',
    utilisateurId: admin.id,
  });
  assert.equal(fournisseurs.listerDettes(base, { fournisseurId: fournisseur.id })[0].solde, 2500);
  assert.equal(caisse.etat(base).resume.totalTheorique, 3500);
});

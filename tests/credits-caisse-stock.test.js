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

  assert.throws(() => ventes.enregistrer(base, {
    lignes: [{ reference: 'EAU', quantite: 1 }],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
  }), /caisse n'est pas ouverte/);
  assert.equal(articles.lireParReference(base, 'EAU').stock, 3);
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

test('retour client sur vente credit remet le stock et diminue la creance', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const client = clients.creer(base, { nom: 'Client Retour', plafondCredit: 5000 });
  articles.creer(base, { reference: 'JUS', designation: 'Jus', prixUnitaire: 300, stock: 10 });
  caisse.ouvrir(base, { fondOuverture: 1000, utilisateurId: admin.id });

  const vente = ventes.enregistrer(base, {
    lignes: [{ reference: 'JUS', quantite: 3 }],
    paiement: { mode: 'credit' },
    clientId: client.id,
    utilisateurId: admin.id,
    exigerCaisse: true,
  });
  const venteRelue = ventes.lire(base, vente.id);
  assert.equal(articles.lireParReference(base, 'JUS').stock, 7);
  assert.equal(clients.listerCreances(base, { clientId: client.id })[0].solde, 900);

  const retour = ventes.retourner(base, {
    venteId: vente.id,
    utilisateurId: admin.id,
    lignes: [{ ligneVenteId: venteRelue.panier.lignes[0].id, quantite: 1 }],
  });

  assert.match(retour.numero, /^RC-/);
  assert.equal(retour.totalTtc, 300);
  assert.equal(retour.montantDeduitCreance, 300);
  assert.equal(retour.montantAvoir, 0);
  assert.equal(articles.lireParReference(base, 'JUS').stock, 8);
  assert.equal(clients.listerCreances(base, { clientId: client.id })[0].solde, 600);

  const apresRetour = ventes.lire(base, vente.id);
  assert.equal(apresRetour.totalRetours, 300);
  assert.equal(apresRetour.montantNet, 600);
  assert.equal(apresRetour.panier.lignes[0].quantiteRetournee, 1);
  assert.equal(apresRetour.panier.lignes[0].quantiteRetourable, 2);
  assert.equal(apresRetour.retours.length, 1);
  assert.throws(() => ventes.retourner(base, {
    venteId: vente.id,
    utilisateurId: admin.id,
    lignes: [{ ligneVenteId: venteRelue.panier.lignes[0].id, quantite: 3 }],
  }), /Retour trop eleve/);
  assert.throws(() => ventes.annuler(base, vente.id, 'Annulation impossible', admin.id), /retour client/);
});

test('retour client rembourse en especes et peut etre annule proprement', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  articles.creer(base, { reference: 'BIS', designation: 'Biscuit', prixUnitaire: 100, stock: 10 });
  caisse.ouvrir(base, { fondOuverture: 1000, utilisateurId: admin.id });

  const vente = ventes.enregistrer(base, {
    lignes: [{ reference: 'BIS', quantite: 4 }],
    paiement: { mode: 'especes', montantRecu: 400 },
    utilisateurId: admin.id,
    exigerCaisse: true,
  });
  const ligne = ventes.lire(base, vente.id).panier.lignes[0];
  assert.equal(caisse.etat(base).resume.totalTheorique, 1400);

  const retour = ventes.retourner(base, {
    venteId: vente.id,
    modeRemboursement: 'especes',
    utilisateurId: admin.id,
    lignes: [{ ligneVenteId: ligne.id, quantite: 2 }],
  });

  assert.equal(retour.montantRembourse, 200);
  assert.equal(retour.montantAvoir, 0);
  assert.equal(articles.lireParReference(base, 'BIS').stock, 8);
  assert.equal(caisse.etat(base).resume.totalTheorique, 1200, 'fond 1000 + vente 400 - remboursement 200');
  assert.equal(stocks.lister(base, { articleId: ligne.articleId, limite: 1 })[0].retourClientId, retour.id);

  const annule = ventes.annulerRetour(base, retour.id, 'Erreur retour', admin.id);
  assert.equal(annule.statut, 'annule');
  assert.equal(articles.lireParReference(base, 'BIS').stock, 6);
  assert.equal(caisse.etat(base).resume.totalTheorique, 1400);
  assert.equal(ventes.lire(base, vente.id).totalRetours, 0);
});

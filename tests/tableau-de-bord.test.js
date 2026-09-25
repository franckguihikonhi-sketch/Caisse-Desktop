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
const tableauDeBord = require('../src/donnees/tableau-de-bord');
const { jour } = require('../src/metier/horodatage');

test('le tableau de bord donne les indicateurs proprietaire du mois et du stock', () => {
  const base = ouvrir(':memory:');
  const date = jour();
  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Grossiste tableau' });
  const article = articles.creer(base, {
    reference: 'TB-PRO', designation: 'Article proprietaire', prixUnitaire: 1500, stock: 0,
  });

  achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    dateAchat: date,
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [{ articleId: article.id, quantite: 10, prixAchatUnitaire: 1000 }],
  });
  caisse.ouvrir(base, { fondOuverture: 0, utilisateurId: admin.id });
  ventes.enregistrer(base, {
    lignes: [{ reference: 'TB-PRO', quantite: 3 }],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
  });

  const dashboard = tableauDeBord.lire(base, { date });

  assert.equal(dashboard.proprietaire.mois.ventes, 4500);
  assert.equal(dashboard.proprietaire.mois.tickets, 1);
  assert.equal(dashboard.proprietaire.mois.margeNette, 1500);
  assert.equal(dashboard.proprietaire.mois.tauxMarge, 33.3);
  assert.equal(dashboard.proprietaire.stock.valeurAchat, 7000);
  assert.equal(dashboard.proprietaire.stock.valeurVente, 10500);
  assert.equal(dashboard.proprietaire.stock.margePotentielle, 3500);
  assert.equal(dashboard.proprietaire.netCredits, -10000);
});

test('les bornes proprietaire suivent le mois courant de la date demandee', () => {
  assert.deepEqual(tableauDeBord.bornesMois('2026-09-25'), { debut: '2026-09-01', fin: '2026-09-25' });
});

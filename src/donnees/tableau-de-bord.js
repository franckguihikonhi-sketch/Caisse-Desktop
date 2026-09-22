'use strict';

const { jour } = require('../metier/horodatage');
const caisse = require('./caisse');
const clients = require('./clients');
const fournisseurs = require('./fournisseurs');
const articles = require('./articles');

function ventesDuJour(base, date = jour()) {
  const totaux = base.prepare(
    'SELECT COUNT(*) AS nombre, COALESCE(SUM(total_ttc), 0) AS total, ' +
      'COALESCE(SUM(CASE WHEN paiement_credit = 1 THEN total_ttc ELSE 0 END), 0) AS credit, ' +
      'COALESCE(SUM(CASE WHEN paiement_credit = 0 THEN total_ttc ELSE 0 END), 0) AS encaisse FROM ventes ' +
      'WHERE date(date_vente) = ? AND annulee = 0'
  ).get(date);
  const parMode = base.prepare(
    'SELECT CASE WHEN paiement_credit = 1 THEN \'credit\' ELSE mode_paiement END AS mode, ' +
      'COUNT(*) AS nombre, COALESCE(SUM(total_ttc), 0) AS total FROM ventes ' +
      'WHERE date(date_vente) = ? AND annulee = 0 GROUP BY mode'
  ).all(date);
  return { ...totaux, parMode };
}

function lire(base, { date = jour() } = {}) {
  const stockBas = articles.sousLeSeuil(base).slice(0, 8);
  const rupture = base.prepare('SELECT COUNT(*) AS n FROM articles WHERE actif = 1 AND stock <= 0').get().n;
  const topArticles = base.prepare(
    'SELECT lignes_vente.designation, SUM(lignes_vente.quantite) AS quantite, SUM(lignes_vente.total_ttc) AS total ' +
      'FROM lignes_vente JOIN ventes ON ventes.id = lignes_vente.vente_id ' +
      'WHERE date(ventes.date_vente) = ? AND ventes.annulee = 0 ' +
      'GROUP BY lignes_vente.reference, lignes_vente.designation ORDER BY quantite DESC, total DESC LIMIT 5'
  ).all(date);

  return {
    date,
    caisse: caisse.etat(base),
    ventes: ventesDuJour(base, date),
    clients: clients.synthese(base),
    fournisseurs: fournisseurs.synthese(base),
    stock: { alertes: stockBas, rupture },
    topArticles,
  };
}

module.exports = { lire };

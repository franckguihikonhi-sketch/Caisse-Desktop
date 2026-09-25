'use strict';

const { jour } = require('../metier/horodatage');
const caisse = require('./caisse');
const clients = require('./clients');
const fournisseurs = require('./fournisseurs');
const achats = require('./achats');
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

function bornesMois(date) {
  const jourTexte = String(date || jour()).slice(0, 10);
  return { debut: jourTexte.slice(0, 7) + '-01', fin: jourTexte };
}

function ventesPeriode(base, debut, fin) {
  return base.prepare(
    'SELECT COUNT(*) AS nombre, COALESCE(SUM(total_ttc), 0) AS total, ' +
      'COALESCE(SUM(CASE WHEN paiement_credit = 0 THEN total_ttc ELSE 0 END), 0) AS encaisse, ' +
      'COALESCE(SUM(CASE WHEN paiement_credit = 1 THEN total_ttc ELSE 0 END), 0) AS credit ' +
      'FROM ventes WHERE date(date_vente) BETWEEN ? AND ? AND annulee = 0'
  ).get(debut, fin);
}

function rentabilitePeriode(base, debut, fin) {
  const ventes = base.prepare(
    'SELECT COALESCE(SUM(lignes_vente.total_ttc), 0) AS chiffreAffaires, ' +
      'COALESCE(SUM(lignes_vente.prix_achat_unitaire * lignes_vente.quantite), 0) AS coutRevient, ' +
      'COALESCE(SUM(lignes_vente.marge_totale), 0) AS margeBrute FROM lignes_vente ' +
      'JOIN ventes ON ventes.id = lignes_vente.vente_id ' +
      'WHERE date(ventes.date_vente) BETWEEN ? AND ? AND ventes.annulee = 0'
  ).get(debut, fin);

  const retours = base.prepare(
    'SELECT COALESCE(SUM(lignes_retour_client.total_ttc), 0) AS chiffreAffaires, ' +
      'COALESCE(SUM(CASE WHEN lignes_vente.quantite > 0 THEN ' +
        'CAST(ROUND(1.0 * lignes_vente.marge_totale * lignes_retour_client.quantite / lignes_vente.quantite) AS INTEGER) ' +
        'ELSE 0 END), 0) AS marge FROM lignes_retour_client ' +
      'JOIN retours_clients ON retours_clients.id = lignes_retour_client.retour_id ' +
      'JOIN lignes_vente ON lignes_vente.id = lignes_retour_client.ligne_vente_id ' +
      'JOIN ventes ON ventes.id = lignes_vente.vente_id ' +
      "WHERE date(ventes.date_vente) BETWEEN ? AND ? AND ventes.annulee = 0 AND retours_clients.statut = 'valide'"
  ).get(debut, fin);

  const chiffreAffairesNet = Math.max(0, ventes.chiffreAffaires - retours.chiffreAffaires);
  const margeNette = ventes.margeBrute - retours.marge;
  const tauxMarge = chiffreAffairesNet > 0 ? Math.round((margeNette / chiffreAffairesNet) * 1000) / 10 : 0;
  return {
    chiffreAffaires: ventes.chiffreAffaires,
    chiffreAffairesNet,
    coutRevient: ventes.coutRevient,
    margeBrute: ventes.margeBrute,
    margeRetours: retours.marge,
    margeNette,
    tauxMarge,
  };
}

function valorisationStock(base) {
  const dernierPrixPiece = "(SELECT lignes_achat.prix_achat_unitaire FROM lignes_achat " +
    "JOIN achats ON achats.id = lignes_achat.achat_id " +
    "WHERE lignes_achat.article_id = articles.id AND lignes_achat.unite_achat = 'piece' " +
      "AND achats.statut = 'valide' " +
    "ORDER BY achats.date_achat DESC, achats.id DESC, lignes_achat.id DESC LIMIT 1)";
  const dernierPrixCarton = "(SELECT lignes_achat.prix_achat_unitaire FROM lignes_achat " +
    "JOIN achats ON achats.id = lignes_achat.achat_id " +
    "WHERE lignes_achat.article_id = articles.id AND lignes_achat.unite_achat = 'carton' " +
      "AND achats.statut = 'valide' " +
    "ORDER BY achats.date_achat DESC, achats.id DESC, lignes_achat.id DESC LIMIT 1)";
  const coutCarton = 'COALESCE(prix_achat_carton, ' + dernierPrixCarton + ')';
  const coutPiece = 'COALESCE(prix_achat_piece, ' + dernierPrixPiece + ', ' +
    'CASE WHEN ' + coutCarton + ' IS NOT NULL AND pieces_par_carton > 0 ' +
    'THEN CAST(ROUND(1.0 * ' + coutCarton + ' / pieces_par_carton) AS INTEGER) ELSE 0 END, 0)';
  const ligne = base.prepare(
    'SELECT COUNT(*) AS articlesActifs, COALESCE(SUM(stock), 0) AS unitesStock, ' +
      'COALESCE(SUM(stock * (' + coutPiece + ')), 0) AS valeurAchat, ' +
      'COALESCE(SUM(stock * prix_unitaire), 0) AS valeurVente, ' +
      'COALESCE(SUM(CASE WHEN stock <= seuil_alerte THEN 1 ELSE 0 END), 0) AS articlesSousSeuil ' +
      'FROM articles WHERE actif = 1'
  ).get();
  const margePotentielle = ligne.valeurVente - ligne.valeurAchat;
  const tauxPotentiel = ligne.valeurVente > 0
    ? Math.round((margePotentielle / ligne.valeurVente) * 1000) / 10
    : 0;
  return { ...ligne, margePotentielle, tauxPotentiel };
}

function rentabiliteDuJour(base, date = jour()) {
  const ventes = base.prepare(
    'SELECT COALESCE(SUM(lignes_vente.total_ttc), 0) AS chiffreAffaires, ' +
      'COALESCE(SUM(lignes_vente.prix_achat_unitaire * lignes_vente.quantite), 0) AS coutRevient, ' +
      'COALESCE(SUM(lignes_vente.marge_totale), 0) AS margeBrute FROM lignes_vente ' +
      'JOIN ventes ON ventes.id = lignes_vente.vente_id ' +
      'WHERE date(ventes.date_vente) = ? AND ventes.annulee = 0'
  ).get(date);

  const retours = base.prepare(
    'SELECT COALESCE(SUM(lignes_retour_client.total_ttc), 0) AS chiffreAffaires, ' +
      'COALESCE(SUM(CASE WHEN lignes_vente.quantite > 0 THEN ' +
        'CAST(ROUND(1.0 * lignes_vente.marge_totale * lignes_retour_client.quantite / lignes_vente.quantite) AS INTEGER) ' +
        'ELSE 0 END), 0) AS marge FROM lignes_retour_client ' +
      'JOIN retours_clients ON retours_clients.id = lignes_retour_client.retour_id ' +
      'JOIN lignes_vente ON lignes_vente.id = lignes_retour_client.ligne_vente_id ' +
      'JOIN ventes ON ventes.id = lignes_vente.vente_id ' +
      "WHERE date(ventes.date_vente) = ? AND ventes.annulee = 0 AND retours_clients.statut = 'valide'"
  ).get(date);

  const chiffreAffairesNet = Math.max(0, ventes.chiffreAffaires - retours.chiffreAffaires);
  const margeNette = ventes.margeBrute - retours.marge;
  const tauxMarge = chiffreAffairesNet > 0 ? Math.round((margeNette / chiffreAffairesNet) * 1000) / 10 : 0;

  return {
    chiffreAffaires: ventes.chiffreAffaires,
    chiffreAffairesNet,
    coutRevient: ventes.coutRevient,
    margeBrute: ventes.margeBrute,
    margeRetours: retours.marge,
    margeNette,
    tauxMarge,
  };
}

function lire(base, { date = jour() } = {}) {
  const stockBas = articles.sousLeSeuil(base).slice(0, 8);
  const rupture = base.prepare('SELECT COUNT(*) AS n FROM articles WHERE actif = 1 AND stock <= 0').get().n;
  const clientsResume = clients.synthese(base);
  const fournisseursResume = fournisseurs.synthese(base);
  const mois = bornesMois(date);
  const ventesMois = ventesPeriode(base, mois.debut, mois.fin);
  const rentabiliteMois = rentabilitePeriode(base, mois.debut, mois.fin);
  const stockValorise = valorisationStock(base);
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
    rentabilite: rentabiliteDuJour(base, date),
    clients: clientsResume,
    fournisseurs: fournisseursResume,
    achats: achats.synthese(base, { date }),
    stock: { alertes: stockBas, rupture, valorisation: stockValorise },
    proprietaire: {
      mois: {
        debut: mois.debut,
        fin: mois.fin,
        ventes: ventesMois.total,
        tickets: ventesMois.nombre,
        encaisse: ventesMois.encaisse,
        credit: ventesMois.credit,
        margeNette: rentabiliteMois.margeNette,
        tauxMarge: rentabiliteMois.tauxMarge,
      },
      stock: stockValorise,
      netCredits: clientsResume.solde - fournisseursResume.solde,
    },
    topArticles,
  };
}

module.exports = { lire, bornesMois, ventesPeriode, rentabilitePeriode, valorisationStock };

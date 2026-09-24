'use strict';

const conditionnement = require('../metier/conditionnement');

function nombre(valeur) {
  const n = Number(valeur ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function arrondir(valeur) {
  return Math.round(nombre(valeur));
}

function margePourcent(benefice, chiffreAffaires) {
  const ca = nombre(chiffreAffaires);
  if (ca <= 0) return 0;
  return Math.round((nombre(benefice) / ca) * 1000) / 10;
}

function conditionsDates(prefixe, { depuis = null, jusqua = null } = {}) {
  const conditions = [];
  const params = [];
  if (depuis) {
    conditions.push('date(' + prefixe + ') >= ?');
    params.push(depuis);
  }
  if (jusqua) {
    conditions.push('date(' + prefixe + ') <= ?');
    params.push(jusqua);
  }
  return { conditions, params };
}

function lireLotsAchats(base, options = {}) {
  const dates = conditionsDates('achats.date_achat', options);
  const where = ["achats.statut = 'valide'", ...dates.conditions].join(' AND ');
  return base.prepare(
    'SELECT achats.id AS achat_id, achats.numero AS achat_numero, achats.date_achat, ' +
      'achats.reference_document, fournisseurs.nom AS fournisseur_nom, ' +
      'lignes_achat.id AS ligne_achat_id, lignes_achat.article_id, lignes_achat.reference, ' +
      'lignes_achat.designation, lignes_achat.unite_achat, lignes_achat.facteur_stock, ' +
      'lignes_achat.quantite, lignes_achat.quantite_stock, lignes_achat.prix_achat_unitaire, ' +
      'lignes_achat.total_ttc, articles.pieces_par_carton AS pieces_par_carton, ' +
      'COALESCE((SELECT SUM(lignes_retour_fournisseur.quantite_stock) ' +
        'FROM lignes_retour_fournisseur ' +
        'JOIN retours_fournisseurs ON retours_fournisseurs.id = lignes_retour_fournisseur.retour_id ' +
        "WHERE lignes_retour_fournisseur.ligne_achat_id = lignes_achat.id AND retours_fournisseurs.statut = 'valide'" +
      '), 0) AS quantite_stock_retournee ' +
      'FROM lignes_achat ' +
      'JOIN achats ON achats.id = lignes_achat.achat_id ' +
      'JOIN fournisseurs ON fournisseurs.id = achats.fournisseur_id ' +
      'LEFT JOIN articles ON articles.id = lignes_achat.article_id ' +
      'WHERE ' + where + ' ' +
      'ORDER BY achats.date_achat, achats.id, lignes_achat.id'
  ).all(...dates.params).map((l) => {
    const quantiteStockNette = Math.max(0, nombre(l.quantite_stock) - nombre(l.quantite_stock_retournee));
    const facteur = Math.max(1, nombre(l.facteur_stock) || 1);
    const coutPiece = nombre(l.prix_achat_unitaire) / facteur;
    return {
      achatId: l.achat_id,
      achatNumero: l.achat_numero,
      dateAchat: l.date_achat,
      referenceDocument: l.reference_document,
      fournisseurNom: l.fournisseur_nom,
      ligneAchatId: l.ligne_achat_id,
      articleId: l.article_id,
      reference: l.reference,
      designation: l.designation,
      uniteAchat: l.unite_achat,
      facteurStock: facteur,
      piecesParCarton: l.pieces_par_carton ?? facteur,
      quantiteAchat: l.quantite,
      quantiteStockAchetee: l.quantite_stock,
      quantiteStockNette,
      quantiteStockRetournee: l.quantite_stock_retournee,
      prixAchatUnitaire: l.prix_achat_unitaire,
      totalAchat: l.total_ttc,
      coutPiece,
      restant: quantiteStockNette,
    };
  });
}

function lireVentesNettes(base) {
  return base.prepare(
    'SELECT ventes.id AS vente_id, ventes.numero AS vente_numero, ventes.date_vente, ' +
      'lignes_vente.id AS ligne_vente_id, lignes_vente.article_id, lignes_vente.reference, ' +
      'lignes_vente.designation, lignes_vente.prix_unitaire, lignes_vente.quantite, ' +
      'lignes_vente.facteur_stock, lignes_vente.total_ttc, ' +
      'COALESCE((SELECT SUM(lignes_retour_client.quantite_stock) ' +
        'FROM lignes_retour_client ' +
        'JOIN retours_clients ON retours_clients.id = lignes_retour_client.retour_id ' +
        "WHERE lignes_retour_client.ligne_vente_id = lignes_vente.id AND retours_clients.statut = 'valide'" +
      '), 0) AS quantite_stock_retournee, ' +
      'COALESCE((SELECT SUM(lignes_retour_client.total_ttc) ' +
        'FROM lignes_retour_client ' +
        'JOIN retours_clients ON retours_clients.id = lignes_retour_client.retour_id ' +
        "WHERE lignes_retour_client.ligne_vente_id = lignes_vente.id AND retours_clients.statut = 'valide'" +
      '), 0) AS total_retourne ' +
      'FROM lignes_vente ' +
      'JOIN ventes ON ventes.id = lignes_vente.vente_id ' +
      'WHERE ventes.annulee = 0 AND lignes_vente.article_id IS NOT NULL ' +
      'ORDER BY ventes.date_vente, ventes.id, lignes_vente.id'
  ).all().map((l) => {
    const facteur = Math.max(1, nombre(l.facteur_stock) || 1);
    const quantiteStockBrute = nombre(l.quantite) * facteur;
    const quantiteStockVendue = Math.max(0, quantiteStockBrute - nombre(l.quantite_stock_retournee));
    const chiffreAffaires = Math.max(0, nombre(l.total_ttc) - nombre(l.total_retourne));
    return {
      venteId: l.vente_id,
      venteNumero: l.vente_numero,
      dateVente: l.date_vente,
      ligneVenteId: l.ligne_vente_id,
      articleId: l.article_id,
      reference: l.reference,
      designation: l.designation,
      quantiteStockVendue,
      chiffreAffaires,
      revenuPiece: quantiteStockVendue > 0 ? chiffreAffaires / quantiteStockVendue : 0,
    };
  }).filter((l) => l.quantiteStockVendue > 0 && l.chiffreAffaires > 0);
}

function ligneVide(lot) {
  return {
    achatId: lot.achatId,
    achatNumero: lot.achatNumero,
    dateAchat: lot.dateAchat,
    referenceDocument: lot.referenceDocument,
    fournisseurNom: lot.fournisseurNom,
    ligneAchatId: lot.ligneAchatId,
    articleId: lot.articleId,
    reference: lot.reference,
    designation: lot.designation,
    uniteAchat: lot.uniteAchat,
    facteurStock: lot.facteurStock,
    piecesParCarton: lot.piecesParCarton,
    quantiteAchat: lot.quantiteAchat,
    quantiteStockAchetee: lot.quantiteStockAchetee,
    quantiteStockNette: lot.quantiteStockNette,
    quantiteStockVendue: 0,
    prixAchatUnitaire: lot.prixAchatUnitaire,
    coutAchat: 0,
    chiffreAffaires: 0,
    benefice: 0,
    nombreVentes: 0,
    derniereVente: null,
    _ventes: new Set(),
  };
}

function finaliserLigne(ligne) {
  const achat = { piecesParCarton: ligne.piecesParCarton };
  const coutAchat = arrondir(ligne.coutAchat);
  const chiffreAffaires = arrondir(ligne.chiffreAffaires);
  const benefice = arrondir(ligne.benefice);
  return {
    ...ligne,
    coutAchat,
    chiffreAffaires,
    benefice,
    margePourcent: margePourcent(benefice, chiffreAffaires),
    quantiteStockVendueLibelle: conditionnement.decrireStock(ligne.quantiteStockVendue, achat),
    quantiteStockNetteLibelle: conditionnement.decrireStock(ligne.quantiteStockNette, achat),
    nombreVentes: ligne._ventes.size,
    _ventes: undefined,
  };
}

function lister(base, options = {}) {
  const lots = lireLotsAchats(base, options).filter((lot) => lot.quantiteStockNette > 0);
  const lotsParArticle = new Map();
  for (const lot of lots) {
    if (!lotsParArticle.has(lot.articleId)) lotsParArticle.set(lot.articleId, []);
    lotsParArticle.get(lot.articleId).push(lot);
  }

  const lignes = new Map();
  for (const vente of lireVentesNettes(base)) {
    const lotsArticle = lotsParArticle.get(vente.articleId) ?? [];
    let restantVente = vente.quantiteStockVendue;
    for (const lot of lotsArticle) {
      if (restantVente <= 0) break;
      if (lot.restant <= 0) continue;
      if (String(lot.dateAchat) > String(vente.dateVente)) continue;

      const quantite = Math.min(restantVente, lot.restant);
      let ligne = lignes.get(lot.ligneAchatId);
      if (!ligne) {
        ligne = ligneVide(lot);
        lignes.set(lot.ligneAchatId, ligne);
      }

      const chiffre = vente.revenuPiece * quantite;
      const cout = lot.coutPiece * quantite;
      ligne.quantiteStockVendue += quantite;
      ligne.chiffreAffaires += chiffre;
      ligne.coutAchat += cout;
      ligne.benefice += chiffre - cout;
      ligne.derniereVente = !ligne.derniereVente || vente.dateVente > ligne.derniereVente
        ? vente.dateVente
        : ligne.derniereVente;
      ligne._ventes.add(vente.venteId);

      lot.restant -= quantite;
      restantVente -= quantite;
    }
  }

  const lignesVendues = [...lignes.values()]
    .filter((ligne) => ligne.quantiteStockVendue > 0)
    .map(finaliserLigne)
    .sort((a, b) => String(b.dateAchat).localeCompare(String(a.dateAchat)) || b.achatId - a.achatId);

  const facturesMap = new Map();
  for (const ligne of lignesVendues) {
    let facture = facturesMap.get(ligne.achatId);
    if (!facture) {
      facture = {
        achatId: ligne.achatId,
        numero: ligne.achatNumero,
        dateAchat: ligne.dateAchat,
        fournisseurNom: ligne.fournisseurNom,
        referenceDocument: ligne.referenceDocument,
        lignes: [],
        quantiteStockVendue: 0,
        coutAchat: 0,
        chiffreAffaires: 0,
        benefice: 0,
      };
      facturesMap.set(ligne.achatId, facture);
    }
    facture.lignes.push(ligne);
    facture.quantiteStockVendue += ligne.quantiteStockVendue;
    facture.coutAchat += ligne.coutAchat;
    facture.chiffreAffaires += ligne.chiffreAffaires;
    facture.benefice += ligne.benefice;
  }

  const factures = [...facturesMap.values()].map((facture) => ({
    ...facture,
    margePourcent: margePourcent(facture.benefice, facture.chiffreAffaires),
  }));

  const resume = factures.reduce((acc, facture) => {
    acc.factures += 1;
    acc.lignes += facture.lignes.length;
    acc.quantiteStockVendue += facture.quantiteStockVendue;
    acc.coutAchat += facture.coutAchat;
    acc.chiffreAffaires += facture.chiffreAffaires;
    acc.benefice += facture.benefice;
    return acc;
  }, { factures: 0, lignes: 0, quantiteStockVendue: 0, coutAchat: 0, chiffreAffaires: 0, benefice: 0 });
  resume.margePourcent = margePourcent(resume.benefice, resume.chiffreAffaires);

  return { resume, factures };
}

module.exports = { lister };

'use strict';

const { horodater, jour } = require('../metier/horodatage');
const articles = require('./articles');
const stocks = require('./stocks');

function normaliserLignes(lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new RangeError('Inventaire vide : comptez au moins un article.');
  }
  const deja = new Set();
  return lignes.map((ligne) => {
    const articleId = Number(ligne.articleId);
    const stockCompte = Number(ligne.stockCompte ?? ligne.stockPhysique ?? ligne.compte);
    if (!Number.isInteger(articleId) || articleId <= 0) throw new RangeError('Article inventorie invalide.');
    if (!Number.isInteger(stockCompte) || stockCompte < 0) {
      throw new RangeError('Le stock compte doit etre un entier positif ou nul.');
    }
    if (deja.has(articleId)) throw new RangeError('Un article ne peut apparaitre qu une fois dans un inventaire.');
    deja.add(articleId);
    return { articleId, stockCompte };
  });
}

function numeroSuivant(base, date = jour()) {
  const prefixe = 'INV-' + String(date).replace(/-/g, '') + '-';
  const dernier = base.prepare('SELECT numero FROM inventaires WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1')
    .get(prefixe + '%');
  const n = dernier ? Number(String(dernier.numero).slice(prefixe.length)) + 1 : 1;
  return prefixe + String(n).padStart(3, '0');
}

function preparer(base) {
  return articles.lister(base).map((article) => ({
    articleId: article.id,
    reference: article.reference,
    designation: article.designation,
    stockTheorique: article.stock,
    stockTheoriqueLibelle: article.stockLibelle,
    piecesParCarton: article.piecesParCarton,
    conditionnement: article.conditionnement,
  }));
}

function lire(base, id) {
  const inv = base.prepare(
    'SELECT inventaires.*, utilisateurs.nom AS utilisateur FROM inventaires ' +
      'LEFT JOIN utilisateurs ON utilisateurs.id = inventaires.utilisateur_id WHERE inventaires.id = ?'
  ).get(id);
  if (!inv) return null;
  const lignes = base.prepare(
    'SELECT lignes_inventaire.*, mouvements_stock.stock_apres FROM lignes_inventaire ' +
      'LEFT JOIN mouvements_stock ON mouvements_stock.id = lignes_inventaire.mouvement_id ' +
      'WHERE inventaire_id = ? ORDER BY designation'
  ).all(inv.id).map((l) => ({
    id: l.id,
    inventaireId: l.inventaire_id,
    articleId: l.article_id,
    reference: l.reference,
    designation: l.designation,
    stockTheorique: l.stock_theorique,
    stockCompte: l.stock_compte,
    ecart: l.ecart,
    mouvementId: l.mouvement_id,
    stockApres: l.stock_apres ?? l.stock_compte,
  }));
  return {
    id: inv.id,
    numero: inv.numero,
    date: inv.date_inventaire,
    utilisateurId: inv.utilisateur_id,
    utilisateur: inv.utilisateur,
    statut: inv.statut,
    note: inv.note,
    totalLignes: inv.total_lignes,
    totalEcarts: inv.total_ecarts,
    lignes,
  };
}

function enregistrer(base, { lignes, note = '', utilisateurId = null, dateInventaire = horodater() } = {}) {
  const saisies = normaliserLignes(lignes);
  return base.transaction(() => {
    const numero = numeroSuivant(base, String(dateInventaire).slice(0, 10));
    const r = base.prepare(
      'INSERT INTO inventaires (numero, date_inventaire, utilisateur_id, statut, note, total_lignes, total_ecarts) ' +
        "VALUES (?, ?, ?, 'applique', ?, 0, 0)"
    ).run(numero, dateInventaire, utilisateurId, String(note ?? '').trim() || null);

    let totalEcarts = 0;
    let totalLignes = 0;
    for (const saisie of saisies) {
      const article = articles.lireParId(base, saisie.articleId);
      if (!article || article.actif === false) throw new RangeError('Article introuvable pour inventaire.');
      const ecart = saisie.stockCompte - article.stock;
      let mouvement = null;
      if (ecart !== 0) {
        mouvement = stocks.fixerStock(base, {
          articleId: article.id,
          nouveauStock: saisie.stockCompte,
          motif: 'Inventaire physique ' + numero,
          reference: numero,
          utilisateurId,
        });
      }
      base.prepare(
        'INSERT INTO lignes_inventaire (inventaire_id, article_id, reference, designation, stock_theorique, stock_compte, ecart, mouvement_id) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(r.lastInsertRowid, article.id, article.reference, article.designation, article.stock, saisie.stockCompte, ecart, mouvement?.id ?? null);
      totalLignes += 1;
      totalEcarts += Math.abs(ecart);
    }

    base.prepare('UPDATE inventaires SET total_lignes = ?, total_ecarts = ? WHERE id = ?')
      .run(totalLignes, totalEcarts, r.lastInsertRowid);
    return lire(base, r.lastInsertRowid);
  })();
}

function lister(base, { limite = 30 } = {}) {
  const borne = Math.max(1, Math.min(200, Number(limite) || 30));
  return base.prepare(
    'SELECT inventaires.*, utilisateurs.nom AS utilisateur FROM inventaires ' +
      'LEFT JOIN utilisateurs ON utilisateurs.id = inventaires.utilisateur_id ' +
      'ORDER BY inventaires.id DESC LIMIT ?'
  ).all(borne).map((inv) => ({
    id: inv.id,
    numero: inv.numero,
    date: inv.date_inventaire,
    utilisateur: inv.utilisateur,
    statut: inv.statut,
    note: inv.note,
    totalLignes: inv.total_lignes,
    totalEcarts: inv.total_ecarts,
  }));
}

module.exports = { preparer, enregistrer, lire, lister, numeroSuivant };

'use strict';

const { horodater } = require('../metier/horodatage');

function entier(nom, valeur, { strictementPositif = false } = {}) {
  const nombre = Number(valeur);
  if (!Number.isInteger(nombre) || (strictementPositif ? nombre <= 0 : nombre < 0)) {
    throw new RangeError(nom + ' doit etre un entier ' + (strictementPositif ? 'positif.' : 'positif ou nul.'));
  }
  return nombre;
}

function lireArticle(base, articleId) {
  const article = base.prepare('SELECT id, reference, designation, stock FROM articles WHERE id = ? AND actif = 1').get(articleId);
  if (!article) throw new RangeError('Article introuvable.');
  return article;
}

function signer(type, quantite) {
  if (type === 'entree' || type === 'retour') return Math.abs(quantite);
  if (type === 'sortie') return -Math.abs(quantite);
  if (type === 'ajustement') {
    if (!Number.isInteger(quantite) || quantite === 0) {
      throw new RangeError("La correction de stock doit porter un ecart non nul.");
    }
    return quantite;
  }
  throw new RangeError('Type de mouvement de stock inconnu.');
}

/**
 * Enregistre un mouvement de stock et met a jour le stock courant. Toutes les
 * sorties passent ici : une sortie qui rendrait le stock negatif est refusee.
 */
function mouvement(base, demande) {
  return base.transaction(() => {
    const type = String(demande.type ?? '').trim();
    const quantite = signer(type, Number(demande.quantite));
    const article = lireArticle(base, demande.articleId);
    const stockAvant = article.stock;
    const stockApres = stockAvant + quantite;
    if (stockApres < 0) {
      throw new RangeError(
        'Stock insuffisant pour ' + article.designation +
          ' : ' + stockAvant + ' en stock, sortie de ' + Math.abs(quantite) + '.'
      );
    }

    const motif = String(demande.motif ?? '').trim() || motifParDefaut(type);
    const date = demande.dateMouvement || horodater();

    base.prepare('UPDATE articles SET stock = ? WHERE id = ?').run(stockApres, article.id);
    const r = base.prepare(
      'INSERT INTO mouvements_stock (article_id, date_mouvement, type, quantite, stock_avant, ' +
        'stock_apres, motif, reference, utilisateur_id, fournisseur_id, vente_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      article.id, date, type, quantite, stockAvant, stockApres, motif,
      demande.reference ? String(demande.reference).trim() : null,
      demande.utilisateurId ?? null,
      demande.fournisseurId ?? null,
      demande.venteId ?? null
    );

    return lireMouvement(base, r.lastInsertRowid);
  })();
}

function fixerStock(base, { articleId, nouveauStock, motif, reference, utilisateurId }) {
  return base.transaction(() => {
    const article = lireArticle(base, articleId);
    const cible = entier('Le stock', nouveauStock);
    const ecart = cible - article.stock;
    if (ecart === 0) return null;
    return mouvement(base, {
      articleId,
      type: 'ajustement',
      quantite: ecart,
      motif: motif || 'Correction de stock',
      reference,
      utilisateurId,
    });
  })();
}

function motifParDefaut(type) {
  return {
    entree: 'Entree en stock',
    sortie: 'Sortie de stock',
    retour: 'Retour en stock',
    ajustement: 'Correction de stock',
  }[type] ?? 'Mouvement de stock';
}

function lireMouvement(base, id) {
  const l = base.prepare(
    'SELECT mouvements_stock.*, articles.reference AS article_reference, articles.designation AS article_designation, ' +
      'fournisseurs.nom AS fournisseur, utilisateurs.nom AS utilisateur FROM mouvements_stock ' +
      'JOIN articles ON articles.id = mouvements_stock.article_id ' +
      'LEFT JOIN fournisseurs ON fournisseurs.id = mouvements_stock.fournisseur_id ' +
      'LEFT JOIN utilisateurs ON utilisateurs.id = mouvements_stock.utilisateur_id ' +
      'WHERE mouvements_stock.id = ?'
  ).get(id);
  return enLigne(l);
}

function enLigne(l) {
  return l && {
    id: l.id,
    articleId: l.article_id,
    articleReference: l.article_reference,
    articleDesignation: l.article_designation,
    date: l.date_mouvement,
    type: l.type,
    quantite: l.quantite,
    stockAvant: l.stock_avant,
    stockApres: l.stock_apres,
    motif: l.motif,
    reference: l.reference,
    utilisateur: l.utilisateur,
    fournisseur: l.fournisseur,
    fournisseurId: l.fournisseur_id,
    venteId: l.vente_id,
  };
}

function lister(base, { articleId = null, limite = 100 } = {}) {
  const borne = Math.max(1, Math.min(500, Number(limite) || 100));
  const sql =
    'SELECT mouvements_stock.*, articles.reference AS article_reference, articles.designation AS article_designation, ' +
    'fournisseurs.nom AS fournisseur, utilisateurs.nom AS utilisateur FROM mouvements_stock ' +
    'JOIN articles ON articles.id = mouvements_stock.article_id ' +
    'LEFT JOIN fournisseurs ON fournisseurs.id = mouvements_stock.fournisseur_id ' +
    'LEFT JOIN utilisateurs ON utilisateurs.id = mouvements_stock.utilisateur_id ' +
    (articleId ? 'WHERE mouvements_stock.article_id = ? ' : '') +
    'ORDER BY mouvements_stock.id DESC LIMIT ?';
  const params = articleId ? [articleId, borne] : [borne];
  return base.prepare(sql).all(...params).map(enLigne);
}

module.exports = { mouvement, fixerStock, lister };

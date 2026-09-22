'use strict';

const { horodater } = require('../metier/horodatage');
const conditionnement = require('../metier/conditionnement');

function entier(nom, valeur, { strictementPositif = false, negatifAutorise = false } = {}) {
  const nombre = Number(valeur);
  const invalide = !Number.isInteger(nombre) ||
    (strictementPositif ? nombre <= 0 : (!negatifAutorise && nombre < 0));
  if (invalide) {
    throw new RangeError(nom + ' doit etre un entier ' + (strictementPositif ? 'positif.' : 'positif ou nul.'));
  }
  return nombre;
}

function lireArticle(base, articleId) {
  const article = base.prepare(
    'SELECT id, reference, designation, stock, pieces_par_carton, prix_unitaire, prix_carton, ' +
      'vente_piece, vente_carton FROM articles WHERE id = ? AND actif = 1'
  ).get(articleId);
  if (!article) throw new RangeError('Article introuvable.');
  return {
    ...article,
    piecesParCarton: article.pieces_par_carton ?? 1,
    prixUnitaire: article.prix_unitaire,
    prixCarton: article.prix_carton,
    ventePiece: article.vente_piece === undefined ? true : Boolean(article.vente_piece),
    venteCarton: article.vente_carton === undefined ? false : Boolean(article.vente_carton),
  };
}

function quantiteBase(article, demande) {
  const unite = conditionnement.normaliserUnite(demande.unite ?? demande.uniteMouvement ?? 'piece');
  const quantiteUnites = entier('La quantite', demande.quantite, {
    strictementPositif: demande.type !== 'ajustement',
    negatifAutorise: demande.type === 'ajustement',
  });
  const facteur = conditionnement.facteurStock(article, unite);
  if (unite === 'carton' && article.piecesParCarton <= 1) {
    throw new RangeError(article.designation + ' n a pas de conditionnement carton.');
  }
  return { unite, quantiteUnites, facteur, quantitePieces: quantiteUnites * facteur };
}

function signer(type, quantitePieces) {
  if (type === 'entree' || type === 'retour') return Math.abs(quantitePieces);
  if (type === 'sortie') return -Math.abs(quantitePieces);
  if (type === 'ajustement') {
    if (!Number.isInteger(quantitePieces) || quantitePieces === 0) {
      throw new RangeError("La correction de stock doit porter un ecart non nul.");
    }
    return quantitePieces;
  }
  throw new RangeError('Type de mouvement de stock inconnu.');
}

/**
 * Enregistre un mouvement de stock et met a jour le stock courant.
 * La base stocke toujours la quantite en pieces, avec l'unite de saisie gardee
 * en trace. Toute sortie qui rendrait le stock negatif est refusee.
 */
function mouvement(base, demande) {
  return base.transaction(() => {
    const type = String(demande.type ?? '').trim();
    const article = lireArticle(base, demande.articleId);
    const q = quantiteBase(article, { ...demande, type });
    const quantite = signer(type, q.quantitePieces);
    const stockAvant = article.stock;
    const stockApres = stockAvant + quantite;
    if (stockApres < 0) {
      throw new RangeError(
        'Stock insuffisant pour ' + article.designation +
          ' : ' + conditionnement.decrireStock(stockAvant, article) +
          ' en stock, sortie de ' + conditionnement.decrireStock(Math.abs(quantite), article) + '.'
      );
    }

    const motif = String(demande.motif ?? '').trim() || motifParDefaut(type);
    const date = demande.dateMouvement || horodater();

    base.prepare('UPDATE articles SET stock = ? WHERE id = ?').run(stockApres, article.id);
    const r = base.prepare(
      'INSERT INTO mouvements_stock (article_id, date_mouvement, type, quantite, stock_avant, stock_apres, ' +
        'motif, reference, utilisateur_id, fournisseur_id, vente_id, achat_id, retour_fournisseur_id, ' +
        'retour_client_id, unite_mouvement, facteur_stock, quantite_unites) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      article.id, date, type, quantite, stockAvant, stockApres, motif,
      demande.reference ? String(demande.reference).trim() : null,
      demande.utilisateurId ?? null,
      demande.fournisseurId ?? null,
      demande.venteId ?? null,
      demande.achatId ?? null,
      demande.retourFournisseurId ?? null,
      demande.retourClientId ?? null,
      q.unite,
      q.facteur,
      type === 'ajustement' ? q.quantiteUnites : Math.abs(q.quantiteUnites)
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
      unite: 'piece',
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
      'articles.pieces_par_carton AS article_pieces_par_carton, ' +
      'fournisseurs.nom AS fournisseur, utilisateurs.nom AS utilisateur FROM mouvements_stock ' +
      'JOIN articles ON articles.id = mouvements_stock.article_id ' +
      'LEFT JOIN fournisseurs ON fournisseurs.id = mouvements_stock.fournisseur_id ' +
      'LEFT JOIN utilisateurs ON utilisateurs.id = mouvements_stock.utilisateur_id ' +
      'WHERE mouvements_stock.id = ?'
  ).get(id);
  return enLigne(l);
}

function enLigne(l) {
  if (!l) return null;
  const piecesParCarton = l.article_pieces_par_carton ?? 1;
  return {
    id: l.id,
    articleId: l.article_id,
    articleReference: l.article_reference,
    articleDesignation: l.article_designation,
    date: l.date_mouvement,
    type: l.type,
    quantite: l.quantite,
    quantiteLibelle: conditionnement.decrireStock(Math.abs(l.quantite), piecesParCarton),
    stockAvant: l.stock_avant,
    stockAvantLibelle: conditionnement.decrireStock(l.stock_avant, piecesParCarton),
    stockApres: l.stock_apres,
    stockApresLibelle: conditionnement.decrireStock(l.stock_apres, piecesParCarton),
    uniteMouvement: l.unite_mouvement,
    facteurStock: l.facteur_stock,
    quantiteUnites: l.quantite_unites,
    motif: l.motif,
    reference: l.reference,
    utilisateur: l.utilisateur,
    fournisseur: l.fournisseur,
    fournisseurId: l.fournisseur_id,
    venteId: l.vente_id,
    achatId: l.achat_id,
    retourFournisseurId: l.retour_fournisseur_id,
    retourClientId: l.retour_client_id,
  };
}

function lister(base, { articleId = null, limite = 100 } = {}) {
  const borne = Math.max(1, Math.min(500, Number(limite) || 100));
  const sql =
    'SELECT mouvements_stock.*, articles.reference AS article_reference, articles.designation AS article_designation, ' +
    'articles.pieces_par_carton AS article_pieces_par_carton, ' +
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

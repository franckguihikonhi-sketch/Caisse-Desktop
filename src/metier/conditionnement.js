'use strict';

/**
 * Un article est stocke dans une unite minimale entiere : la piece.
 * Le carton n'est qu'une unite de vente/de mouvement qui consomme N pieces.
 * Toute coherence de stock se ramene donc a un nombre entier de pieces.
 */

const UNITES = new Set(['piece', 'carton']);

function normaliserUnite(unite = 'piece') {
  const u = String(unite ?? 'piece').trim().toLowerCase();
  if (!UNITES.has(u)) throw new RangeError('Unite inconnue : ' + unite + '.');
  return u;
}

function libelleUnite(unite, quantite = 1) {
  const u = normaliserUnite(unite);
  if (u === 'carton') return quantite > 1 ? 'cartons' : 'carton';
  return quantite > 1 ? 'pieces' : 'piece';
}

function piecesParCarton(article) {
  const n = Number(article.piecesParCarton ?? article.pieces_par_carton ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function facteurStock(article, unite = 'piece') {
  const u = normaliserUnite(unite);
  return u === 'carton' ? piecesParCarton(article) : 1;
}

function prixPourUnite(article, unite = 'piece') {
  const u = normaliserUnite(unite);
  if (u === 'piece') return Number(article.prixUnitaire ?? article.prix_unitaire ?? 0);
  const prixCarton = article.prixCarton ?? article.prix_carton;
  if (prixCarton !== null && prixCarton !== undefined && prixCarton !== '') return Number(prixCarton);
  return Number(article.prixUnitaire ?? article.prix_unitaire ?? 0) * piecesParCarton(article);
}

function verifierVendable(article, unite = 'piece') {
  const u = normaliserUnite(unite);
  if (u === 'piece' && article.ventePiece === false) {
    throw new RangeError(article.designation + ' ne se vend pas a la piece.');
  }
  if (u === 'carton') {
    if (piecesParCarton(article) <= 1 || article.venteCarton === false) {
      throw new RangeError(article.designation + ' ne se vend pas en carton.');
    }
  }
  return true;
}

function quantiteStock(article, quantite, unite = 'piece') {
  const q = Number(quantite);
  if (!Number.isInteger(q) || q <= 0) throw new RangeError('La quantite doit etre un entier positif.');
  verifierVendable(article, unite);
  return q * facteurStock(article, unite);
}

function decrireStock(stockPieces, articleOuPiecesParCarton = 1) {
  const stock = Number(stockPieces ?? 0);
  const parCarton = typeof articleOuPiecesParCarton === 'object'
    ? piecesParCarton(articleOuPiecesParCarton)
    : Number(articleOuPiecesParCarton || 1);
  if (!Number.isInteger(stock)) return String(stockPieces ?? 0) + ' pieces';
  if (parCarton <= 1) return stock + ' ' + libelleUnite('piece', Math.abs(stock));
  const signe = stock < 0 ? '-' : '';
  const absolu = Math.abs(stock);
  const cartons = Math.floor(absolu / parCarton);
  const pieces = absolu % parCarton;
  const morceaux = [];
  if (cartons > 0) morceaux.push(cartons + ' ' + libelleUnite('carton', cartons));
  if (pieces > 0 || morceaux.length === 0) morceaux.push(pieces + ' ' + libelleUnite('piece', pieces));
  return signe + morceaux.join(' + ');
}

function libelleConditionnement(article) {
  const parCarton = piecesParCarton(article);
  return parCarton > 1 ? '1 carton = ' + parCarton + ' pieces' : 'Piece';
}

module.exports = {
  normaliserUnite,
  libelleUnite,
  piecesParCarton,
  facteurStock,
  prixPourUnite,
  verifierVendable,
  quantiteStock,
  decrireStock,
  libelleConditionnement,
};

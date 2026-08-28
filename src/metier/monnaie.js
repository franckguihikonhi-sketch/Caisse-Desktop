'use strict';

/**
 * Le franc CFA n'a pas de subdivision en circulation : tous les montants sont
 * des entiers, et la plus petite piece vaut 5 F. Un montant encaisse en especes
 * est donc arrondi au multiple de 5 le plus proche, alors qu'un montant paye
 * par carte ou mobile money tombe au franc pres.
 */

const COUPURES = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5];
const PLUS_PETITE_PIECE = 5;

function arrondirAuFranc(montant) {
  return Math.round(montant);
}

function arrondirEspeces(montant) {
  return Math.round(montant / PLUS_PETITE_PIECE) * PLUS_PETITE_PIECE;
}

function formater(montant) {
  const entier = Math.round(montant);
  const signe = entier < 0 ? '-' : '';
  const chiffres = String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return signe + chiffres + ' F';
}

/**
 * Decompose la monnaie a rendre en coupures, de la plus grosse a la plus petite.
 * Leve une erreur si le client n'a pas donne assez.
 */
function rendreMonnaie(montantDu, montantRecu) {
  if (!Number.isFinite(montantDu) || !Number.isFinite(montantRecu)) {
    throw new TypeError('Les montants doivent etre des nombres.');
  }
  const du = arrondirEspeces(montantDu);
  const recu = arrondirAuFranc(montantRecu);
  if (recu < du) {
    throw new RangeError(
      'Montant recu insuffisant : il manque ' + formater(du - recu) + '.'
    );
  }

  let reste = recu - du;
  const detail = [];
  for (const coupure of COUPURES) {
    const nombre = Math.floor(reste / coupure);
    if (nombre > 0) {
      detail.push({ coupure, nombre });
      reste -= nombre * coupure;
    }
  }
  return { montantDu: du, montantRecu: recu, rendu: recu - du, detail };
}

module.exports = {
  COUPURES,
  PLUS_PETITE_PIECE,
  arrondirAuFranc,
  arrondirEspeces,
  formater,
  rendreMonnaie,
};

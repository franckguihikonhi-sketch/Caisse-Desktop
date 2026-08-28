'use strict';

/**
 * Codes-barres des articles.
 *
 * Les codes du commerce - EAN-13, EAN-8, UPC-A - portent un dernier chiffre
 * calcule a partir des autres. Le verifier attrape la faute de frappe du jour
 * ou la douchette est en panne et ou l'on saisit le code a la main : un chiffre
 * inverse ne tombe presque jamais juste.
 *
 * Une boutique rencontre aussi des codes libres : des suites de chiffres sans
 * longueur normalisee, relevees a la main ou heritees d'un ancien logiciel.
 * Personne ne peut en verifier la cle. La regle retenue : on refuse un code de
 * 8, 12 ou 13 chiffres dont la cle est fausse, puisqu'il se donne pour un code
 * du commerce et n'en est pas un ; on accepte les autres longueurs telles
 * quelles, comme codes libres.
 *
 * Pour ce que la boutique etiquette elle-meme, il ne faut surtout pas d'un
 * code libre : il ne se dessine pas. La norme reserve a l'usage interne des
 * magasins les EAN-13 commençant par 2. Un code attribue ainsi est un EAN-13
 * complet, cle comprise — donc imprimable et lisible par n'importe quelle
 * douchette, sans jamais entrer en conflit avec le code d'un fabricant.
 */

const LONGUEURS_NORMALISEES = { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13' };
const LONGUEUR_MAXIMALE = 24;

/** Retire les espaces et tirets que les etiquettes affichent pour la lecture. */
function normaliser(code) {
  return String(code ?? '').replace(/[\s-]/g, '');
}

/**
 * Cle de controle d'un corps de code : somme ponderee 3 et 1 en partant de la
 * droite, complement a la dizaine superieure.
 */
function chiffreDeControle(corps) {
  const chiffres = [...String(corps)].map(Number);
  let somme = 0;
  for (let rang = 0; rang < chiffres.length; rang += 1) {
    // Le chiffre le plus a droite du corps pese 3, puis on alterne.
    const poids = (chiffres.length - 1 - rang) % 2 === 0 ? 3 : 1;
    somme += chiffres[rang] * poids;
  }
  return (10 - (somme % 10)) % 10;
}

function estNormalise(code) {
  const c = normaliser(code);
  return Boolean(LONGUEURS_NORMALISEES[c.length]);
}

/** Le type d'un code du commerce, ou 'libre' pour les autres longueurs. */
function typeDe(code) {
  const c = normaliser(code);
  return LONGUEURS_NORMALISEES[c.length] ?? 'libre';
}

/**
 * Verifie un code. Rend {valide: true, code, type} ou {valide: false, motif}.
 * Le motif est ecrit pour etre montre au caissier tel quel.
 */
function verifier(code) {
  const c = normaliser(code);

  if (c === '') return { valide: false, motif: 'Code-barres vide.' };
  if (!/^\d+$/.test(c)) {
    return { valide: false, motif: 'Un code-barres ne contient que des chiffres.' };
  }
  if (c.length < 4) {
    return { valide: false, motif: 'Code-barres trop court : 4 chiffres au minimum.' };
  }
  if (c.length > LONGUEUR_MAXIMALE) {
    return {
      valide: false,
      motif: 'Code-barres trop long : ' + LONGUEUR_MAXIMALE + ' chiffres au maximum.',
    };
  }

  const type = typeDe(c);
  if (type !== 'libre') {
    const attendu = chiffreDeControle(c.slice(0, -1));
    if (Number(c.at(-1)) !== attendu) {
      return {
        valide: false,
        motif:
          'Ce code se donne pour un ' + type + ' mais sa cle est fausse : ' +
          attendu + ' etait attendu, ' + c.at(-1) + ' a ete lu. Verifiez la saisie.',
      };
    }
  }

  return { valide: true, code: c, type };
}

// La norme reserve aux magasins les EAN-13 commençant par ce chiffre.
const PREFIXE_USAGE_INTERNE = '2';
const LONGUEUR_EAN13 = 13;

/**
 * Fabrique le code d'usage interne portant ce numero d'ordre : le prefixe
 * reserve, le numero cale a droite, et la cle qui va avec.
 */
function construireCodeInterne(numero) {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new RangeError("Le numero d'ordre doit etre un entier positif.");
  }
  const placesLibres = LONGUEUR_EAN13 - 1 - PREFIXE_USAGE_INTERNE.length;
  const corps = PREFIXE_USAGE_INTERNE + String(numero).padStart(placesLibres, '0');
  if (corps.length > LONGUEUR_EAN13 - 1) {
    throw new RangeError("Numero d'ordre trop grand pour un code interne.");
  }
  return completer(corps);
}

/** Dit si ce code est un EAN-13 reserve a l'usage interne du magasin. */
function estUsageInterne(code) {
  const c = normaliser(code);
  return c.length === LONGUEUR_EAN13 &&
    c.startsWith(PREFIXE_USAGE_INTERNE) &&
    verifier(c).valide;
}

/** Complete un corps de code pour en faire un code valide. Sert aux tests et aux essais. */
function completer(corps) {
  const c = normaliser(corps);
  return c + chiffreDeControle(c);
}

module.exports = {
  normaliser, chiffreDeControle, verifier, typeDe, estNormalise, completer,
  construireCodeInterne, estUsageInterne,
  LONGUEURS_NORMALISEES, LONGUEUR_MAXIMALE, PREFIXE_USAGE_INTERNE,
};

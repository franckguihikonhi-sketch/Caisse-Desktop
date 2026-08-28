'use strict';

/**
 * Dessin des codes-barres EAN-13, EAN-8 et UPC-A.
 *
 * Un code-barres est une suite de modules, sombres ou clairs, de largeur egale.
 * Chaque chiffre en occupe sept, encadres par des marques de garde. En EAN-13,
 * le premier chiffre n'est pas dessine : il se lit dans l'alternance de parite
 * des six suivants, ce qui permet de faire tenir treize chiffres dans la place
 * de douze.
 *
 * Seule la table L est ecrite ici. La table R en est le complement, et la table
 * G le miroir de R : deux tables recopiees de moins, donc deux occasions de
 * faute en moins. Les tests comparent les tables derivees aux tables publiees.
 */

const { verifier, normaliser } = require('./code-barres');

const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

const inverser = (motif) => [...motif].map((m) => (m === '0' ? '1' : '0')).join('');
const refleter = (motif) => [...motif].reverse().join('');

const R = L.map(inverser);
const G = R.map(refleter);

// Le premier chiffre d'un EAN-13 choisit l'alternance L/G des six suivants.
const ALTERNANCES = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const GARDE_LATERALE = '101';
const GARDE_CENTRALE = '01010';

// Zones franches : sans ces marges claires, une douchette ne trouve pas le debut.
const ZONE_FRANCHE_GAUCHE = 11;
const ZONE_FRANCHE_DROITE = 7;

/**
 * Encode un code en suite de modules ('0' clair, '1' sombre).
 * @returns {{modules: string, type: string, code: string, groupes: object}}
 */
function encoder(code) {
  const verdict = verifier(code);
  if (!verdict.valide) throw new RangeError(verdict.motif);

  // Un UPC-A est un EAN-13 dont le premier chiffre est zero : memes barres.
  const type = verdict.type;
  if (type === 'interne') {
    throw new RangeError(
      'Un code interne de ' + verdict.code.length + ' chiffres ne se dessine pas : ' +
        'seuls les EAN-13, EAN-8 et UPC-A ont un trace normalise.'
    );
  }

  const chiffres = type === 'UPC-A' ? '0' + verdict.code : verdict.code;
  return type === 'EAN-8'
    ? { ...encoderEan8(chiffres), type, code: verdict.code }
    : { ...encoderEan13(chiffres), type, code: verdict.code };
}

function encoderEan13(chiffres) {
  const premier = Number(chiffres[0]);
  const alternance = ALTERNANCES[premier];

  const gauche = [...chiffres.slice(1, 7)]
    .map((c, i) => (alternance[i] === 'L' ? L : G)[Number(c)])
    .join('');
  const droite = [...chiffres.slice(7)].map((c) => R[Number(c)]).join('');

  return {
    modules: GARDE_LATERALE + gauche + GARDE_CENTRALE + droite + GARDE_LATERALE,
    // Ce qui s'imprime sous les barres, groupe comme sur un emballage.
    groupes: { avant: chiffres[0], gauche: chiffres.slice(1, 7), droite: chiffres.slice(7) },
  };
}

function encoderEan8(chiffres) {
  const gauche = [...chiffres.slice(0, 4)].map((c) => L[Number(c)]).join('');
  const droite = [...chiffres.slice(4)].map((c) => R[Number(c)]).join('');

  return {
    modules: GARDE_LATERALE + gauche + GARDE_CENTRALE + droite + GARDE_LATERALE,
    groupes: { avant: '', gauche: chiffres.slice(0, 4), droite: chiffres.slice(4) },
  };
}

/** Les gardes descendent plus bas que les barres : c'est ce qui borne la lecture. */
function estGarde(type, position) {
  const fin = type === 'EAN-8' ? 67 : 95;
  const centre = type === 'EAN-8' ? 31 : 45;
  return (
    position < 3 || position >= fin - 3 ||
    (position >= centre && position < centre + 5)
  );
}

/**
 * Rend le code-barres en SVG, mesure en modules : c'est la feuille de style
 * qui lui donne sa taille finale en millimetres. Aucune dependance, aucune
 * police exterieure - la page d'etiquettes s'imprime hors ligne.
 */
function enSvg(code, { hauteurBarres = 60, avecChiffres = true } = {}) {
  const { modules, type, groupes } = encoder(code);

  const largeur = ZONE_FRANCHE_GAUCHE + modules.length + ZONE_FRANCHE_DROITE;
  const debordement = 5;
  const hauteurTexte = avecChiffres ? 11 : 0;
  const hauteur = hauteurBarres + debordement + hauteurTexte;

  const barres = [];
  for (let i = 0; i < modules.length; i += 1) {
    if (modules[i] !== '1') continue;
    const bas = hauteurBarres + (estGarde(type, i) ? debordement : 0);
    barres.push(
      '<rect x="' + (ZONE_FRANCHE_GAUCHE + i) + '" y="0" width="1" height="' + bas + '"/>'
    );
  }

  const textes = [];
  if (avecChiffres) {
    const y = hauteur - 1;
    const poser = (x, contenu, ancrage) =>
      '<text x="' + x + '" y="' + y + '" text-anchor="' + ancrage + '">' + contenu + '</text>';

    const centre = type === 'EAN-8' ? 31 : 45;
    if (groupes.avant) {
      textes.push(poser(ZONE_FRANCHE_GAUCHE - 2, groupes.avant, 'end'));
    }
    textes.push(poser(ZONE_FRANCHE_GAUCHE + 3 + (centre - 3) / 2, groupes.gauche, 'middle'));
    textes.push(
      poser(ZONE_FRANCHE_GAUCHE + centre + 5 + (modules.length - 3 - centre - 5) / 2,
        groupes.droite, 'middle')
    );
  }

  return (
    '<svg class="code-barres" viewBox="0 0 ' + largeur + ' ' + hauteur + '" ' +
    'preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="0" y="0" width="' + largeur + '" height="' + hauteur + '" fill="#fff"/>' +
    '<g fill="#000">' + barres.join('') + '</g>' +
    '<g fill="#000" font-family="monospace" font-size="10">' + textes.join('') + '</g>' +
    '</svg>'
  );
}

/** Dit si un code peut etre dessine, sans lever d'erreur. */
function estDessinable(code) {
  const verdict = verifier(normaliser(code));
  return verdict.valide && verdict.type !== 'interne';
}

module.exports = { encoder, enSvg, estDessinable, L, G, R, ALTERNANCES };

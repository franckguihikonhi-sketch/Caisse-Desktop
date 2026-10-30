'use strict';

/*
 * Reglages d'impression du ticket. Fonctions pures : elles decident de la
 * largeur du papier, de la taille du texte et de la hauteur de page a
 * demander au pilote. Un ticket qui sort blanc vient presque toujours d'une
 * page envoyee sans format : le pilote thermique recoit alors une feuille A4
 * et n'imprime rien d'utilisable.
 */

const LARGEURS_MM = [58, 80];
const MODES = ['texte', 'image'];

const LARGEUR_DEFAUT_MM = 58;
const MODE_DEFAUT = 'texte';
const TAILLE_DEFAUT = 12;
const TAILLE_MIN = 9;
const TAILLE_MAX = 20;

const MARGE_HAUT_MM = 3;
const MARGE_BAS_MM = 8;
const MARGE_COTE_MM = 2;
const HAUTEUR_MIN_MM = 40;
const INTERLIGNE = 1.35;
// Un pixel CSS vaut 1/96 de pouce ; un pouce vaut 25,4 mm.
const MM_PAR_PIXEL = 25.4 / 96;

function nombreDansIntervalle(valeur, mini, maxi, defaut) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return defaut;
  return Math.min(maxi, Math.max(mini, Math.round(nombre)));
}

/** Transforme les parametres bruts de la base en reglages surs. */
function normaliser(parametres = {}) {
  const largeurBrute = Number(parametres['impression.largeur_mm']);
  const modeBrut = String(parametres['impression.mode'] ?? '');
  return {
    largeurMm: LARGEURS_MM.includes(largeurBrute) ? largeurBrute : LARGEUR_DEFAUT_MM,
    mode: MODES.includes(modeBrut) ? modeBrut : MODE_DEFAUT,
    silencieuse: String(parametres['impression.silencieuse'] ?? 'non') === 'oui',
    taillePolice: nombreDansIntervalle(
      parametres['impression.taille_police'], TAILLE_MIN, TAILLE_MAX, TAILLE_DEFAUT
    ),
  };
}

/** Hauteur de papier a demander, en millimetres, pour un nombre de lignes donne. */
function hauteurMm(nombreLignes, reglages) {
  const lignes = Math.max(1, Number(nombreLignes) || 1);
  const hauteurLigneMm = reglages.taillePolice * INTERLIGNE * MM_PAR_PIXEL;
  const total = MARGE_HAUT_MM + MARGE_BAS_MM + lignes * hauteurLigneMm;
  return Math.max(HAUTEUR_MIN_MM, Math.ceil(total));
}

/** Format de page pour webContents.print(), qui compte en microns. */
function formatImpression(nombreLignes, reglages) {
  return {
    width: Math.round(reglages.largeurMm * 1000),
    height: Math.round(hauteurMm(nombreLignes, reglages) * 1000),
  };
}

/** Format de page pour printToPDF(), qui compte en pouces. */
function formatPdf(nombreLignes, reglages) {
  return {
    width: reglages.largeurMm / 25.4,
    height: hauteurMm(nombreLignes, reglages) / 25.4,
  };
}

/** Taille de la fenetre de rendu, en pixels, pour que rien ne soit coupe. */
function tailleFenetre(nombreLignes, reglages, echelle = 1) {
  const largeurPx = Math.round((reglages.largeurMm / MM_PAR_PIXEL) * echelle);
  const hauteurPx = Math.round((hauteurMm(nombreLignes, reglages) / MM_PAR_PIXEL) * echelle);
  return { largeur: Math.max(120, largeurPx), hauteur: Math.max(200, hauteurPx) };
}

module.exports = {
  LARGEURS_MM,
  MODES,
  MARGE_HAUT_MM,
  MARGE_COTE_MM,
  INTERLIGNE,
  normaliser,
  hauteurMm,
  formatImpression,
  formatPdf,
  tailleFenetre,
};

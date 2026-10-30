'use strict';

/*
 * Fabrication des pages imprimables du ticket. Rien d'Electron ici : ce sont
 * des chaines HTML, donc verifiables par les tests sans fenetre ni imprimante.
 */

const reglagesImpression = require('./impression-reglages');

const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const echapper = (t) => String(t).replace(/[&<>]/g, (c) => ECHAPPEMENTS[c]);

/**
 * Le ticket est du texte a chasse fixe : on le pose tel quel dans une page a la
 * largeur du rouleau, sans marge laterale, ce qui donne le meme rendu a
 * l'ecran, sur une imprimante thermique et dans le PDF. La largeur et la
 * taille du texte viennent des reglages : une page sans format declare est la
 * premiere cause de ticket qui sort blanc.
 */
function pageTicket(lignes, reglages = reglagesImpression.normaliser()) {
  const hauteur = reglagesImpression.hauteurMm(lignes.length, reglages);
  return (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<title>Ticket</title><style>' +
    '@page { size: ' + reglages.largeurMm + 'mm ' + hauteur + 'mm; margin: 0; }' +
    'html, body { background: #fff; color: #000; }' +
    'body { margin: 0; padding: ' + reglagesImpression.MARGE_HAUT_MM + 'mm ' +
      reglagesImpression.MARGE_COTE_MM + 'mm; width: ' + reglages.largeurMm + 'mm; }' +
    'pre { margin: 0; color: #000; font: ' + reglages.taillePolice + 'px/' +
      reglagesImpression.INTERLIGNE + ' "Courier New", "DejaVu Sans Mono", monospace; ' +
      'white-space: pre-wrap; word-break: break-word; -webkit-print-color-adjust: exact; }' +
    '</style></head><body><pre>' + echapper(lignes.join('\n')) + '</pre></body></html>'
  );
}

/** Page qui ne contient qu'une image : secours pour les pilotes thermiques qui ignorent le texte. */
function pageImage(dataUrl, reglages) {
  return (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ticket</title><style>' +
    '@page { size: ' + reglages.largeurMm + 'mm auto; margin: 0; }' +
    'html, body { margin: 0; background: #fff; }' +
    'img { display: block; width: ' + reglages.largeurMm + 'mm; }' +
    '</style></head><body><img src="' + dataUrl + '" alt="Ticket"></body></html>'
  );
}

module.exports = { pageTicket, pageImage, echapper };

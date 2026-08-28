'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { BrowserWindow } = require('electron');

const { construireTicket } = require('../metier/ticket');
const { construirePage, FORMATS } = require('../metier/etiquettes');

const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const echapper = (t) => String(t).replace(/[&<>]/g, (c) => ECHAPPEMENTS[c]);

/**
 * Le ticket est du texte a chasse fixe : on le pose tel quel dans une page de
 * 58 mm de large, sans marge, ce qui donne le meme rendu a l'ecran, sur une
 * imprimante thermique et dans le PDF.
 */
function pageTicket(lignes) {
  return (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<title>Ticket</title><style>' +
    '@page { size: 58mm auto; margin: 0; }' +
    'body { margin: 0; padding: 3mm 2mm; }' +
    'pre { margin: 0; font: 11px/1.35 "Courier New", monospace; white-space: pre; }' +
    '</style></head><body><pre>' + echapper(lignes.join('\n')) + '</pre></body></html>'
  );
}

/**
 * Ouvre une fenetre invisible sur une page fabriquee ici. Le HTML passe par un
 * fichier temporaire plutot que par une URL data: — une planche de 65
 * codes-barres pese plusieurs centaines de kilo-octets, ce qu'une URL ne porte
 * pas de façon fiable.
 */
async function fenetreSurPage(html) {
  const fichier = path.join(
    os.tmpdir(), 'caisse-impression-' + crypto.randomBytes(8).toString('hex') + '.html'
  );
  fs.writeFileSync(fichier, html, 'utf8');

  const fenetre = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await fenetre.loadFile(fichier);
  } catch (erreur) {
    fenetre.destroy();
    fs.rmSync(fichier, { force: true });
    throw erreur;
  }
  return {
    fenetre,
    liberer() {
      fenetre.destroy();
      fs.rmSync(fichier, { force: true });
    },
  };
}

/** Envoie une page a l'imprimante. Une boite fermee par l'utilisateur n'est pas une erreur. */
function envoyer(fenetre, options) {
  return new Promise((resoudre, rejeter) => {
    fenetre.webContents.print(options, (reussi, motif) => {
      if (!reussi && motif && motif !== 'cancelled') rejeter(new Error(motif));
      else resoudre({ imprime: reussi });
    });
  });
}

async function imprimer(vente, boutique) {
  const { fenetre, liberer } = await fenetreSurPage(pageTicket(construireTicket({ boutique, vente })));
  try {
    return await envoyer(fenetre, {
      silent: false, printBackground: false, margins: { marginType: 'none' },
    });
  } finally {
    liberer();
  }
}

async function exporterPdf(vente, boutique, dossier) {
  const { fenetre, liberer } = await fenetreSurPage(pageTicket(construireTicket({ boutique, vente })));
  try {
    const pdf = await fenetre.webContents.printToPDF({
      // printToPDF mesure en pouces, la ou print() mesure en microns.
      pageSize: { width: 58 / 25.4, height: 200 / 25.4 },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: false,
    });
    fs.mkdirSync(dossier, { recursive: true });
    const chemin = path.join(dossier, vente.numero + '.pdf');
    fs.writeFileSync(chemin, pdf);
    return chemin;
  } finally {
    liberer();
  }
}

// --- Etiquettes -------------------------------------------------------------

function dimensions(format) {
  const reglage = FORMATS[format];
  if (!reglage) throw new RangeError('Format d etiquettes inconnu : ' + format + '.');
  return reglage.page;
}

async function imprimerEtiquettes(demande) {
  const planche = construirePage(demande);
  const { largeur, hauteur } = dimensions(demande.format);
  const { fenetre, liberer } = await fenetreSurPage(planche.html);

  try {
    // print() attend des microns : un millimetre en vaut mille.
    const resultat = await envoyer(fenetre, {
      silent: false,
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: { width: Math.round(largeur * 1000), height: Math.round(hauteur * 1000) },
    });
    return { ...resultat, ...compteRendu(planche) };
  } finally {
    liberer();
  }
}

async function exporterEtiquettesPdf(demande, dossier) {
  const planche = construirePage(demande);
  const { largeur, hauteur } = dimensions(demande.format);
  const { fenetre, liberer } = await fenetreSurPage(planche.html);

  try {
    const pdf = await fenetre.webContents.printToPDF({
      pageSize: { width: largeur / 25.4, height: hauteur / 25.4 },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
    });
    fs.mkdirSync(dossier, { recursive: true });
    const horodatage = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const chemin = path.join(dossier, 'etiquettes-' + horodatage + '.pdf');
    fs.writeFileSync(chemin, pdf);
    return { chemin, ...compteRendu(planche) };
  } finally {
    liberer();
  }
}

function compteRendu(planche) {
  return {
    nombreEtiquettes: planche.nombreEtiquettes,
    nombrePages: planche.nombrePages,
    ecartes: planche.ecartes.map((e) => ({
      designation: e.article.designation, motif: e.motif,
    })),
  };
}

module.exports = {
  imprimer, exporterPdf, imprimerEtiquettes, exporterEtiquettesPdf, pageTicket,
};

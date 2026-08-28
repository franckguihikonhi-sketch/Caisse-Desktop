'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');

const { construireTicket } = require('../metier/ticket');

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

function fenetreTicket(html) {
  const fenetre = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  const charge = fenetre.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return charge.then(() => fenetre);
}

async function imprimer(vente, boutique) {
  const fenetre = await fenetreTicket(pageTicket(construireTicket({ boutique, vente })));
  try {
    return await new Promise((resoudre, rejeter) => {
      fenetre.webContents.print(
        { silent: false, printBackground: false, margins: { marginType: 'none' } },
        (reussi, motif) => {
          // Un utilisateur qui ferme la boite d'impression n'est pas une erreur.
          if (!reussi && motif && motif !== 'cancelled') rejeter(new Error(motif));
          else resoudre({ imprime: reussi });
        }
      );
    });
  } finally {
    fenetre.destroy();
  }
}

async function exporterPdf(vente, boutique, dossier) {
  const fenetre = await fenetreTicket(pageTicket(construireTicket({ boutique, vente })));
  try {
    const pdf = await fenetre.webContents.printToPDF({
      pageSize: { width: 58 / 25.4, height: 200 / 25.4 },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: false,
    });
    fs.mkdirSync(dossier, { recursive: true });
    const chemin = path.join(dossier, vente.numero + '.pdf');
    fs.writeFileSync(chemin, pdf);
    return chemin;
  } finally {
    fenetre.destroy();
  }
}

module.exports = { imprimer, exporterPdf, pageTicket };

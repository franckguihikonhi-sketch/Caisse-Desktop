'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { BrowserWindow } = require('electron');

const { construireTicket } = require('../metier/ticket');
const { construirePage, FORMATS } = require('../metier/etiquettes');
const monnaie = require('../metier/monnaie');

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

function dateLisible(valeur) {
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? String(valeur ?? '') : date.toLocaleString('fr-FR');
}

function pageFactureVente(vente, boutique) {
  const lignes = vente.panier.lignes.map((ligne) => (
    '<tr>' +
      '<td><strong>' + echapper(ligne.designation) + '</strong><small>' + echapper(ligne.reference) + '</small></td>' +
      '<td>' + echapper(ligne.uniteVente === 'carton' ? 'Carton' : 'Piece') + '</td>' +
      '<td class="nombre">' + echapper(ligne.quantite) + '</td>' +
      '<td class="nombre">' + echapper(monnaie.formater(ligne.prixUnitaire)) + '</td>' +
      '<td class="nombre">' + echapper(ligne.remisePourcent || 0) + ' %</td>' +
      '<td class="nombre total">' + echapper(monnaie.formater(ligne.totalTtc)) + '</td>' +
    '</tr>'
  )).join('');
  const client = vente.client ? vente.client.nom + ' (' + vente.client.code + ')' : 'Client comptoir';
  const statut = vente.annulee ? '<span class="badge danger">VENTE ANNULEE</span>' : '<span class="badge">VALIDE</span>';
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ' + echapper(vente.numero) + '</title>' +
    '<style>' +
      '@page { size: A4; margin: 12mm; }' +
      '* { box-sizing: border-box; } body { margin:0; color:#10231a; font: 12px/1.45 Arial, sans-serif; }' +
      '.entete { display:flex; justify-content:space-between; gap:24px; border-bottom:4px solid #0b7f4d; padding-bottom:14px; }' +
      '.marque { font-size:25px; font-weight:900; color:#f58220; letter-spacing:-0.03em; }' +
      '.marque span { color:#0b7f4d; } .muted { color:#66756f; } h1 { margin:18px 0 8px; font-size:25px; }' +
      '.bloc { margin-top:14px; padding:12px; border:1px solid #dce8e1; border-radius:12px; background:#f8fbf8; }' +
      '.grille { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px 24px; }' +
      'table { width:100%; border-collapse:collapse; margin-top:16px; } th { background:#0b7f4d; color:#fff; text-align:left; padding:9px; }' +
      'td { border-bottom:1px solid #e5eee8; padding:9px; vertical-align:top; } td small { display:block; color:#66756f; margin-top:3px; }' +
      '.nombre { text-align:right; white-space:nowrap; } .total { font-weight:900; }' +
      '.totaux { width:310px; margin-left:auto; margin-top:14px; } .totaux div { display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid #e5eee8; }' +
      '.totaux .net { margin-top:5px; padding:10px; border-radius:10px; background:#f58220; color:#fff; font-size:16px; font-weight:900; }' +
      '.badge { display:inline-block; padding:5px 9px; border-radius:999px; background:#e7f8ee; color:#0b7f4d; font-weight:900; } .badge.danger { background:#ffe2e6; color:#b4232d; }' +
      '.pied { margin-top:28px; color:#66756f; text-align:center; font-size:11px; }' +
    '</style></head><body>' +
      '<div class="entete"><div><div class="marque">Ivoire-<span>Gestion</span></div>' +
        '<div>' + echapper(boutique.nom || 'Boutique') + '</div>' +
        '<div class="muted">' + echapper([boutique.adresse, boutique.telephone].filter(Boolean).join(' — ')) + '</div>' +
        '<div class="muted">' + echapper(boutique.numeroContribuable ? 'CC: ' + boutique.numeroContribuable : '') + '</div></div>' +
        '<div class="nombre">' + statut + '<h1>Facture de vente</h1><strong>' + echapper(vente.numero) + '</strong></div></div>' +
      '<div class="bloc grille"><div><strong>Client</strong><br>' + echapper(client) + '</div>' +
        '<div><strong>Date</strong><br>' + echapper(dateLisible(vente.date)) + '</div>' +
        '<div><strong>Caissier</strong><br>' + echapper(vente.caissier || '') + '</div>' +
        '<div><strong>Paiement</strong><br>' + echapper(vente.paiement?.mode || '') + '</div></div>' +
      '<table><thead><tr><th>Article</th><th>Unite</th><th class="nombre">Qte</th><th class="nombre">Prix</th><th class="nombre">Remise</th><th class="nombre">Total</th></tr></thead><tbody>' + lignes + '</tbody></table>' +
      '<div class="totaux">' +
        '<div><span>Total brut</span><strong>' + echapper(monnaie.formater(vente.panier.totalBrut)) + '</strong></div>' +
        '<div><span>Remise</span><strong>' + echapper(monnaie.formater(vente.panier.remise)) + '</strong></div>' +
        '<div><span>TVA</span><strong>' + echapper(monnaie.formater(vente.panier.totalTva)) + '</strong></div>' +
        '<div class="net"><span>Total net</span><strong>' + echapper(monnaie.formater(vente.montantNet ?? vente.panier.totalTtc)) + '</strong></div>' +
      '</div>' +
      '<div class="pied">Document genere par Ivoire-Gestion. Merci pour votre confiance.</div>' +
    '</body></html>';
}

async function exporterFactureVentePdf(vente, boutique, dossier) {
  const { fenetre, liberer } = await fenetreSurPage(pageFactureVente(vente, boutique));
  try {
    const pdf = await fenetre.webContents.printToPDF({
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      printBackground: true,
    });
    fs.mkdirSync(dossier, { recursive: true });
    const chemin = path.join(dossier, 'facture-' + vente.numero + '.pdf');
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
  imprimer,
  exporterPdf,
  exporterFactureVentePdf,
  imprimerEtiquettes,
  exporterEtiquettesPdf,
  pageTicket,
  pageFactureVente,
};

'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');

const { ouvrir, boutique } = require('../donnees/base');
const ventes = require('../donnees/ventes');
const { enregistrerCanaux } = require('./canaux');
const impression = require('./impression');

// L'utilisateur connecte est tenu ici, dans le processus principal. Le rendu ne
// fait que l'afficher : il ne peut ni le fabriquer ni s'attribuer un role.
const session = { utilisateur: null };

let fenetre = null;
let bd = null;

function cheminBase() {
  return path.join(app.getPath('userData'), 'donnees', 'caisse.db');
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0f1b2a',
    title: 'Caisse',
    webPreferences: {
      preload: path.join(__dirname, 'passerelle.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  fenetre.once('ready-to-show', () => fenetre.show());
  fenetre.loadFile(path.join(__dirname, '..', 'rendu', 'index.html'));

  // Rien de ce qui est externe ne s'ouvre dans l'application elle-meme.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  fenetre.on('closed', () => { fenetre = null; });
}

function canauxTicket() {
  const repondre = (nom, traitement) => {
    ipcMain.handle(nom, async (_evenement, argument) => {
      try {
        if (!session.utilisateur) throw new Error('Aucune session ouverte.');
        return { ok: true, valeur: await traitement(argument) };
      } catch (erreur) {
        return { ok: false, erreur: erreur.message };
      }
    });
  };

  repondre('ticket:imprimer', async ({ id }) => {
    const vente = ventes.lire(bd, id);
    if (!vente) throw new Error('Vente introuvable.');
    return impression.imprimer(vente, boutique(bd));
  });

  repondre('ticket:pdf', async ({ id }) => {
    const vente = ventes.lire(bd, id);
    if (!vente) throw new Error('Vente introuvable.');
    const dossier = path.join(app.getPath('documents'), 'Caisse', 'tickets');
    const chemin = await impression.exporterPdf(vente, boutique(bd), dossier);
    shell.showItemInFolder(chemin);
    return chemin;
  });
}

app.whenReady().then(() => {
  try {
    bd = ouvrir(cheminBase());
  } catch (erreur) {
    dialog.showErrorBox(
      'Base de donnees inaccessible',
      "La caisse n'a pas pu ouvrir ses donnees :\n\n" + erreur.message
    );
    app.quit();
    return;
  }

  enregistrerCanaux(bd, session);
  canauxTicket();
  creerFenetre();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (bd) bd.close();
});

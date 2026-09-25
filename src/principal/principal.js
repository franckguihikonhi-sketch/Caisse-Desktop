'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');

const { ouvrir, boutique } = require('../donnees/base');
const ventes = require('../donnees/ventes');
const { enregistrerCanaux } = require('./canaux');
const impression = require('./impression');
const configurationBase = require('./configuration-base');
const sauvegardes = require('./sauvegardes');
const exportsRapports = require('./exports');

// L'utilisateur connecte est tenu ici, dans le processus principal. Le rendu ne
// fait que l'afficher : il ne peut ni le fabriquer ni s'attribuer un role.
const NOM_APPLICATION = 'Ivoire-Gestion';
const session = { utilisateur: null };

let fenetre = null;
let bd = null;
let baseActive = null;
let derniereSauvegardeAuto = null;

function informationsBase() {
  baseActive = configurationBase.resoudreBase(app);
  return baseActive;
}

function consoliderBaseAvantCopie() {
  if (!bd) return;
  try {
    bd.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_erreur) {
    // Une base en mode journal classique n'a rien a consolider.
  }
}

function copierBaseSiNecessaire(cible) {
  if (fs.existsSync(cible)) return false;
  if (!baseActive || !fs.existsSync(baseActive.chemin)) return false;
  consoliderBaseAvantCopie();
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.copyFileSync(baseActive.chemin, cible);
  return true;
}

function dossierSauvegardes() {
  return path.join(app.getPath('documents'), NOM_APPLICATION, 'sauvegardes');
}

function dossierSauvegardesAuto() {
  return path.join(app.getPath('documents'), NOM_APPLICATION, 'sauvegardes-automatiques');
}

function sauvegarderBaseVers(cible) {
  if (!baseActive || !fs.existsSync(baseActive.chemin)) {
    throw new Error('Base active introuvable.');
  }
  return sauvegardes.creerCopie(baseActive.chemin, cible, { consolider: consoliderBaseAvantCopie }).chemin;
}

function sauvegarderBaseAutomatiquement() {
  if (!baseActive || !fs.existsSync(baseActive.chemin)) return null;
  derniereSauvegardeAuto = sauvegardes.sauvegarderAutomatiquement({
    source: baseActive.chemin,
    dossier: dossierSauvegardesAuto(),
    consolider: consoliderBaseAvantCopie,
  });
  return derniereSauvegardeAuto;
}

function afficherFenetreSiPrete() {
  if (!fenetre || fenetre.isDestroyed() || fenetre.isVisible()) return;
  fenetre.show();
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1b2a',
    title: NOM_APPLICATION,
    webPreferences: {
      preload: path.join(__dirname, 'passerelle.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  fenetre.setMenuBarVisibility(false);
  fenetre.once('ready-to-show', afficherFenetreSiPrete);
  fenetre.webContents.once('did-finish-load', afficherFenetreSiPrete);
  fenetre.loadFile(path.join(__dirname, '..', 'rendu', 'index.html'))
    .catch((erreur) => {
      dialog.showErrorBox('Interface indisponible', "Ivoire-Gestion n'a pas pu afficher l'ecran :\n\n" + erreur.message);
      afficherFenetreSiPrete();
    });
  setTimeout(afficherFenetreSiPrete, 3000);

  // Rien de ce qui est externe ne s'ouvre dans l'application elle-meme.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  fenetre.on('closed', () => { fenetre = null; });
}

function repondreIpc(nom, traitement, { exigeSession = true, exigeAdmin = false } = {}) {
  ipcMain.handle(nom, async (_evenement, argument) => {
    try {
      if (exigeSession && !session.utilisateur) throw new Error('Aucune session ouverte.');
      if (exigeAdmin && session.utilisateur.role !== 'administrateur') {
        throw new Error("Cette action est reservee a l'administrateur.");
      }
      return { ok: true, valeur: await traitement(argument) };
    } catch (erreur) {
      return { ok: false, erreur: erreur.message };
    }
  });
}

function canauxImpression() {
  const repondre = (nom, traitement) => repondreIpc(nom, traitement);

  repondre('ticket:imprimer', async ({ id }) => {
    const vente = ventes.lire(bd, id);
    if (!vente) throw new Error('Vente introuvable.');
    return impression.imprimer(vente, boutique(bd));
  });

  repondre('etiquettes:imprimer', async (demande) =>
    impression.imprimerEtiquettes({ ...demande, boutique: boutique(bd) }));

  repondre('etiquettes:pdf', async (demande) => {
    const dossier = path.join(app.getPath('documents'), NOM_APPLICATION, 'etiquettes');
    const resultat = await impression.exporterEtiquettesPdf(
      { ...demande, boutique: boutique(bd) }, dossier
    );
    shell.showItemInFolder(resultat.chemin);
    return resultat;
  });

  repondre('ticket:pdf', async ({ id }) => {
    const vente = ventes.lire(bd, id);
    if (!vente) throw new Error('Vente introuvable.');
    const dossier = path.join(app.getPath('documents'), NOM_APPLICATION, 'tickets');
    const chemin = await impression.exporterPdf(vente, boutique(bd), dossier);
    shell.showItemInFolder(chemin);
    return chemin;
  });

  repondre('ticket:facturePdf', async ({ id }) => {
    const vente = ventes.lire(bd, id);
    if (!vente) throw new Error('Vente introuvable.');
    const dossier = path.join(app.getPath('documents'), NOM_APPLICATION, 'factures-ventes');
    const chemin = await impression.exporterFactureVentePdf(vente, boutique(bd), dossier);
    shell.showItemInFolder(chemin);
    return chemin;
  });
}

function canauxBaseDeDonnees() {
  repondreIpc('base:infos', () => configurationBase.decrireBase(baseActive));

  repondreIpc('base:choisirDossier', async () => {
    const choix = await dialog.showOpenDialog(fenetre, {
      title: 'Choisir le dossier partage Ivoire-Gestion',
      buttonLabel: 'Utiliser ce dossier',
      properties: ['openDirectory', 'createDirectory'],
      message: 'Choisissez un dossier partage du reseau local accessible par tous les postes.',
    });
    if (choix.canceled || choix.filePaths.length === 0) return { annule: true };

    const dossier = choix.filePaths[0];
    const cible = configurationBase.cheminBaseDansDossier(dossier);
    if (configurationBase.memeChemin(cible, baseActive.chemin)) {
      return { annule: false, dejaActive: true, ...configurationBase.decrireBase(baseActive) };
    }

    const dejaPresente = fs.existsSync(cible);
    const copieCreee = copierBaseSiNecessaire(cible);
    configurationBase.ecrireConfigurationDans(configurationBase.cheminConfiguration(app), {
      mode: 'reseau',
      cheminBase: cible,
      enregistreLe: new Date().toISOString(),
    });

    return {
      annule: false,
      redemarrageNecessaire: true,
      copieCreee,
      dejaPresente,
      chemin: cible,
      dossier,
      mode: 'reseau',
    };
  }, { exigeAdmin: true });

  repondreIpc('base:retablirLocale', async () => {
    configurationBase.supprimerConfiguration(configurationBase.cheminConfiguration(app));
    return {
      redemarrageNecessaire: true,
      chemin: configurationBase.cheminBaseLocale(app),
      mode: 'local',
    };
  }, { exigeAdmin: true });

  repondreIpc('base:sauvegardes', () => ({
    automatique: derniereSauvegardeAuto,
    dossierAutomatique: dossierSauvegardesAuto(),
    dossierManuel: dossierSauvegardes(),
    fichiersAutomatiques: sauvegardes.lister(dossierSauvegardesAuto()),
    fichiersManuels: sauvegardes.lister(dossierSauvegardes()),
  }), { exigeAdmin: true });

  repondreIpc('base:sauvegarder', async () => {
    const dossier = dossierSauvegardes();
    fs.mkdirSync(dossier, { recursive: true });
    const choix = await dialog.showSaveDialog(fenetre, {
      title: 'Sauvegarder la base Ivoire-Gestion',
      buttonLabel: 'Sauvegarder',
      defaultPath: path.join(dossier, 'ivoire-gestion-sauvegarde-' + sauvegardes.estampille() + '.db'),
      filters: [
        { name: 'Base SQLite', extensions: ['db'] },
        { name: 'Tous les fichiers', extensions: ['*'] },
      ],
    });
    if (choix.canceled || !choix.filePath) return { annule: true };
    const chemin = sauvegarderBaseVers(choix.filePath);
    shell.showItemInFolder(chemin);
    return { annule: false, chemin, date: new Date().toISOString() };
  }, { exigeAdmin: true });

  repondreIpc('exports:csv', async () => {
    const dossier = path.join(app.getPath('documents'), NOM_APPLICATION, 'exports');
    const resultat = exportsRapports.exporterCsv(bd, dossier);
    shell.showItemInFolder(resultat.dossier);
    return resultat;
  }, { exigeAdmin: true });

  repondreIpc('base:restaurerSauvegarde', async () => {
    const choix = await dialog.showOpenDialog(fenetre, {
      title: 'Restaurer une sauvegarde Ivoire-Gestion',
      buttonLabel: 'Restaurer cette sauvegarde',
      defaultPath: dossierSauvegardes(),
      filters: [
        { name: 'Bases SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'Tous les fichiers', extensions: ['*'] },
      ],
      properties: ['openFile'],
      message: 'La base actuelle sera sauvegardee avant restauration, puis Ivoire-Gestion redemarrera.',
    });
    if (choix.canceled || choix.filePaths.length === 0) return { annule: true };

    const resultat = sauvegardes.restaurerDepuis({
      source: choix.filePaths[0],
      cible: baseActive.chemin,
      dossierSecours: dossierSauvegardes(),
      avantCopie: consoliderBaseAvantCopie,
      fermerAvantRemplacement: () => {
        if (bd) {
          bd.close();
          bd = null;
        }
      },
    });
    app.relaunch();
    app.exit(0);
    return { annule: false, redemarrageNecessaire: true, ...resultat };
  }, { exigeAdmin: true });

  repondreIpc('base:redemarrer', async () => {
    app.relaunch();
    app.exit(0);
    return true;
  }, { exigeAdmin: true });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  configurationBase.appliquerCheminUserDataStable(app);

  try {
    const info = informationsBase();
    bd = ouvrir(info.chemin, { reseau: info.mode === 'reseau' });
    sauvegarderBaseAutomatiquement();
  } catch (erreur) {
    dialog.showErrorBox(
      'Base de donnees inaccessible',
      "La caisse n'a pas pu ouvrir ses donnees :\n\n" + erreur.message
    );
    app.quit();
    return;
  }

  enregistrerCanaux(bd, session);
  canauxImpression();
  canauxBaseDeDonnees();
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

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NOM_FICHIER_BASE = 'caisse.db';
const NOM_CONFIGURATION = 'configuration-base.json';
const DOSSIER_DONNEES_STABLE = 'caisse-desktop';

function cheminUserDataStable(app) {
  return path.join(app.getPath('appData'), DOSSIER_DONNEES_STABLE);
}

function appliquerCheminUserDataStable(app) {
  // Le nom visible peut evoluer vers Ivoire-Gestion, mais le dossier technique
  // reste volontairement stable pour ne jamais perdre les donnees deja creees.
  const dossier = cheminUserDataStable(app);
  fs.mkdirSync(dossier, { recursive: true });
  app.setPath('userData', dossier);
}

function cheminConfiguration(app) {
  return path.join(app.getPath('userData'), NOM_CONFIGURATION);
}

function cheminBaseLocale(app) {
  return path.join(app.getPath('userData'), 'donnees', NOM_FICHIER_BASE);
}

function cheminBaseDansDossier(dossier) {
  return path.join(dossier, NOM_FICHIER_BASE);
}

function estCheminReseauWindows(chemin) {
  return /^\\\\[^\\]+\\[^\\]+/.test(String(chemin));
}

function lireConfigurationDepuis(chemin) {
  if (!fs.existsSync(chemin)) return null;
  try {
    const contenu = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    if (!contenu || typeof contenu !== 'object') return null;
    if (typeof contenu.cheminBase !== 'string' || !contenu.cheminBase.trim()) return null;
    return contenu;
  } catch (_erreur) {
    return null;
  }
}

function ecrireConfigurationDans(chemin, configuration) {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, JSON.stringify(configuration, null, 2));
}

function supprimerConfiguration(chemin) {
  if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
}

function resoudreBase(app, env = process.env) {
  const envBase = env.IVOIRE_GESTION_BASE || env.CAISSE_DESKTOP_BASE;
  if (envBase && String(envBase).trim()) {
    const chemin = path.resolve(String(envBase).trim());
    return {
      chemin,
      dossier: path.dirname(chemin),
      mode: env.IVOIRE_GESTION_MODE_RESEAU === '1' || estCheminReseauWindows(chemin) ? 'reseau' : 'local',
      source: 'variable-environnement',
      configuration: null,
    };
  }

  const fichierConfiguration = cheminConfiguration(app);
  const configuration = lireConfigurationDepuis(fichierConfiguration);
  if (configuration) {
    const chemin = path.resolve(configuration.cheminBase);
    return {
      chemin,
      dossier: path.dirname(chemin),
      mode: configuration.mode === 'reseau' || estCheminReseauWindows(chemin) ? 'reseau' : 'local',
      source: 'configuration',
      configuration: fichierConfiguration,
    };
  }

  const chemin = cheminBaseLocale(app);
  return {
    chemin,
    dossier: path.dirname(chemin),
    mode: 'local',
    source: 'locale',
    configuration: fichierConfiguration,
  };
}

function decrireBase(info) {
  return {
    chemin: info.chemin,
    dossier: info.dossier,
    mode: info.mode,
    source: info.source,
    reseau: info.mode === 'reseau',
    fichier: path.basename(info.chemin),
  };
}

function testerDossierPartage(dossier) {
  const debut = Date.now();
  const cible = path.resolve(String(dossier ?? '').trim());
  if (!cible) throw new Error('Dossier partage invalide.');
  fs.mkdirSync(cible, { recursive: true });
  const temporaire = path.join(cible, '.ivoire-gestion-test-' + process.pid + '-' + Date.now() + '.tmp');
  const contenu = 'test ecriture Ivoire-Gestion ' + new Date().toISOString();
  try {
    fs.writeFileSync(temporaire, contenu, { flag: 'wx' });
    const relu = fs.readFileSync(temporaire, 'utf8');
    if (relu !== contenu) throw new Error('Lecture de controle differente.');
  } finally {
    if (fs.existsSync(temporaire)) fs.unlinkSync(temporaire);
  }
  return {
    ok: true,
    dossier: cible,
    cheminBase: cheminBaseDansDossier(cible),
    latenceMs: Date.now() - debut,
  };
}

function memeChemin(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

module.exports = {
  NOM_FICHIER_BASE,
  NOM_CONFIGURATION,
  DOSSIER_DONNEES_STABLE,
  appliquerCheminUserDataStable,
  cheminConfiguration,
  cheminBaseLocale,
  cheminBaseDansDossier,
  lireConfigurationDepuis,
  ecrireConfigurationDans,
  supprimerConfiguration,
  resoudreBase,
  decrireBase,
  estCheminReseauWindows,
  testerDossierPartage,
  memeChemin,
};

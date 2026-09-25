'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ouvrir } = require('../src/donnees/base');
const configurationBase = require('../src/principal/configuration-base');

function fauxApp(dossier) {
  const chemins = {
    appData: dossier,
    userData: path.join(dossier, 'caisse-desktop'),
  };
  return {
    getPath(nom) { return chemins[nom]; },
    setPath(nom, valeur) { chemins[nom] = valeur; },
  };
}

test('le dossier de donnees reste stable meme si le nom visible change', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-userdata-'));
  const app = fauxApp(dossier);

  configurationBase.appliquerCheminUserDataStable(app);

  assert.equal(app.getPath('userData'), path.join(dossier, 'caisse-desktop'));
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('sans configuration, la base reste locale au poste', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-base-locale-'));
  const app = fauxApp(dossier);

  const info = configurationBase.resoudreBase(app, {});

  assert.equal(info.mode, 'local');
  assert.equal(info.source, 'locale');
  assert.equal(info.chemin, path.join(dossier, 'caisse-desktop', 'donnees', 'caisse.db'));
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('une configuration de dossier partage active le mode reseau', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-base-reseau-'));
  const app = fauxApp(dossier);
  const partage = path.join(dossier, 'partage');
  const cible = configurationBase.cheminBaseDansDossier(partage);
  configurationBase.ecrireConfigurationDans(configurationBase.cheminConfiguration(app), {
    mode: 'reseau',
    cheminBase: cible,
  });

  const info = configurationBase.resoudreBase(app, {});

  assert.equal(info.mode, 'reseau');
  assert.equal(info.source, 'configuration');
  assert.equal(info.chemin, cible);
  assert.equal(configurationBase.decrireBase(info).reseau, true);
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('les chemins UNC Windows sont reconnus comme reseau local', () => {
  assert.equal(configurationBase.estCheminReseauWindows('\\\\SERVEUR\\Boutique\\caisse.db'), true);
  assert.equal(configurationBase.estCheminReseauWindows('C:\\Boutique\\caisse.db'), false);
});

test('un dossier partage est teste en lecture ecriture avant usage', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-test-partage-'));
  const resultat = configurationBase.testerDossierPartage(dossier);

  assert.equal(resultat.ok, true);
  assert.equal(resultat.cheminBase, path.join(dossier, 'caisse.db'));
  assert.equal(fs.readdirSync(dossier).filter((nom) => nom.includes('ivoire-gestion-test')).length, 0);
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('une base reseau n utilise pas le WAL et force une synchronisation sure', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-journal-reseau-'));
  const chemin = path.join(dossier, 'caisse.db');
  const base = ouvrir(chemin, { reseau: true });

  assert.equal(base.pragma('journal_mode', { simple: true }), 'delete');
  assert.equal(base.pragma('synchronous', { simple: true }), 2);

  base.close();
  fs.rmSync(dossier, { recursive: true, force: true });
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sauvegardes = require('../src/principal/sauvegardes');

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ivoire-gestion-sauvegardes-'));
}

test('la sauvegarde automatique ne cree qu une copie par jour et conserve les plus recentes', () => {
  const dossier = temp();
  const source = path.join(dossier, 'caisse.db');
  const cible = path.join(dossier, 'auto');
  fs.writeFileSync(source, 'base-du-jour');

  const premiere = sauvegardes.sauvegarderAutomatiquement({
    source,
    dossier: cible,
    maintenant: new Date('2026-09-25T08:00:00'),
    retention: 3,
  });
  assert.equal(premiere.cree, true);
  assert.equal(fs.readFileSync(premiere.sauvegarde.chemin, 'utf8'), 'base-du-jour');

  fs.writeFileSync(source, 'base-modifiee');
  const seconde = sauvegardes.sauvegarderAutomatiquement({
    source,
    dossier: cible,
    maintenant: new Date('2026-09-25T18:00:00'),
    retention: 3,
  });
  assert.equal(seconde.cree, false);
  assert.equal(sauvegardes.lister(cible).length, 1);
  assert.equal(fs.readFileSync(seconde.sauvegarde.chemin, 'utf8'), 'base-du-jour');

  for (let jour = 26; jour <= 29; jour += 1) {
    fs.writeFileSync(source, 'base-' + jour);
    sauvegardes.sauvegarderAutomatiquement({
      source,
      dossier: cible,
      maintenant: new Date('2026-09-' + jour + 'T08:00:00'),
      retention: 3,
    });
  }

  const restantes = sauvegardes.lister(cible);
  assert.equal(restantes.length, 3);
  assert.ok(restantes.every((s) => !s.nom.startsWith(sauvegardes.PREFIXE_AUTO + '20260925')));
});

test('la restauration garde une sauvegarde de securite avant de remplacer la base', () => {
  const dossier = temp();
  const active = path.join(dossier, 'caisse.db');
  const backup = path.join(dossier, 'sauvegarde.db');
  const secours = path.join(dossier, 'secours');
  fs.writeFileSync(active, 'ancienne-base');
  fs.writeFileSync(active + '-wal', 'journal-incompatible');
  fs.writeFileSync(backup, 'base-restauree');

  let fermee = false;
  const resultat = sauvegardes.restaurerDepuis({
    source: backup,
    cible: active,
    dossierSecours: secours,
    maintenant: new Date('2026-09-25T19:00:00'),
    fermerAvantRemplacement: () => { fermee = true; },
  });

  assert.equal(fermee, true);
  assert.equal(fs.readFileSync(active, 'utf8'), 'base-restauree');
  assert.equal(fs.existsSync(active + '-wal'), false);
  assert.equal(fs.readFileSync(resultat.sauvegardeAvantRestauration.chemin, 'utf8'), 'ancienne-base');
});

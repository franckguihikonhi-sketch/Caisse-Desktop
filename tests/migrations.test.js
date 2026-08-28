'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { ouvrir } = require('../src/donnees/base');
const { migrer, MIGRATIONS, DERNIERE_VERSION } = require('../src/donnees/migrations');
const articles = require('../src/donnees/articles');

test('une base neuve arrive directement au dernier palier', () => {
  const base = ouvrir(':memory:');
  assert.equal(base.pragma('user_version', { simple: true }), DERNIERE_VERSION);
});

test('les migrations se suivent sans trou ni doublon', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  assert.deepEqual(versions, versions.map((_, i) => i + 1));
});

test('reouvrir une base ne rejoue aucune migration', () => {
  const base = ouvrir(':memory:');
  const second = migrer(base);
  assert.equal(second.appliquees, 0);
  assert.equal(second.arrivee, DERNIERE_VERSION);
});

test('une caisse deja installee rattrape ce qui lui manque, sans perdre ses ventes', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-migration-'));
  const chemin = path.join(dossier, 'caisse.db');

  // Une base restee a l'etape 1 : les tables d'origine, sans code-barres.
  const ancienne = new Database(chemin);
  MIGRATIONS[0].appliquer(ancienne);
  ancienne.pragma('user_version = 1');
  ancienne
    .prepare(
      'INSERT INTO articles (reference, designation, prix_unitaire, taux_tva, stock) ' +
        'VALUES (?, ?, ?, ?, ?)'
    )
    .run('SAV-01', 'Savon', 325, 18, 40);
  const colonnesAvant = ancienne.pragma('table_info(articles)').map((c) => c.name);
  assert.ok(!colonnesAvant.includes('code_barres'));
  ancienne.close();

  // La caisse s'ouvre : elle doit se mettre a jour toute seule.
  const base = ouvrir(chemin);
  assert.equal(base.pragma('user_version', { simple: true }), DERNIERE_VERSION);

  const colonnesApres = base.pragma('table_info(articles)').map((c) => c.name);
  assert.ok(colonnesApres.includes('code_barres'));

  const savon = articles.lireParReference(base, 'SAV-01');
  assert.equal(savon.designation, 'Savon');
  assert.equal(savon.stock, 40);
  assert.equal(savon.codeBarres, null);

  base.close();
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('deux articles ne peuvent pas porter le meme code-barres', () => {
  const base = ouvrir(':memory:');
  articles.creer(base, {
    reference: 'a', designation: 'Nutella', prixUnitaire: 3500, codeBarres: '3017620422003',
  });
  assert.throws(() => articles.creer(base, {
    reference: 'b', designation: 'Copie', prixUnitaire: 3500, codeBarres: '3017620422003',
  }), /deja porte par un autre article/);
});

test('les codes d usage interne s attribuent a la suite', () => {
  const base = ouvrir(':memory:');
  const premier = articles.attribuerCodeInterne(base);
  const second = articles.attribuerCodeInterne(base);

  assert.equal(premier.numero, 1);
  assert.equal(second.numero, 2);
  assert.notEqual(premier.code, second.code);
  for (const attribue of [premier, second]) {
    assert.ok(attribue.code.startsWith('2'));
    assert.equal(attribue.code.length, 13);
  }
});

test('un numero deja porte par un article est saute', () => {
  const base = ouvrir(':memory:');
  const codeBarres = require('../src/metier/code-barres');

  // Catalogue repris d'ailleurs : le numero 3 est deja pris.
  articles.creer(base, {
    reference: 'repris', designation: 'Beignets', prixUnitaire: 100,
    codeBarres: codeBarres.construireCodeInterne(3),
  });

  assert.equal(articles.attribuerCodeInterne(base).numero, 1);
  assert.equal(articles.attribuerCodeInterne(base).numero, 2);
  assert.equal(articles.attribuerCodeInterne(base).numero, 4, 'le 3 aurait du etre saute');
});

test('un code attribue s enregistre sans heurter la contrainte d unicite', () => {
  const base = ouvrir(':memory:');
  for (let i = 1; i <= 5; i += 1) {
    const { code } = articles.attribuerCodeInterne(base);
    articles.creer(base, {
      reference: 'art-' + i, designation: 'Article ' + i, prixUnitaire: 100, codeBarres: code,
    });
  }
  assert.equal(articles.lister(base).length, 5);
  assert.equal(new Set(articles.lister(base).map((a) => a.codeBarres)).size, 5);
});

test('le compteur survit a la fermeture de la caisse', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-compteur-'));
  const chemin = path.join(dossier, 'caisse.db');

  const premiere = ouvrir(chemin);
  articles.attribuerCodeInterne(premiere);
  articles.attribuerCodeInterne(premiere);
  premiere.close();

  const seconde = ouvrir(chemin);
  assert.equal(articles.attribuerCodeInterne(seconde).numero, 3);
  seconde.close();
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('plusieurs articles peuvent n en porter aucun', () => {
  const base = ouvrir(':memory:');
  articles.creer(base, { reference: 'a', designation: 'Sans code 1', prixUnitaire: 100 });
  articles.creer(base, { reference: 'b', designation: 'Sans code 2', prixUnitaire: 100 });
  assert.equal(articles.lister(base).length, 2);
});

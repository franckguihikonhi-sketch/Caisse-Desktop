'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FORMATS, construirePage, preparer } = require('../src/metier/etiquettes');

const NUTELLA = { designation: 'Pate a tartiner', prixUnitaire: 3500, codeBarres: '3017620422003' };
const COCA = { designation: 'Coca-Cola 33 cl', prixUnitaire: 500, codeBarres: '5449000000996' };
const SANS_CODE = { designation: 'Savon', prixUnitaire: 325, codeBarres: null };
const INTERNE = { designation: 'Vrac', prixUnitaire: 100, codeBarres: '12345' };

test('chaque format tient dans sa page', () => {
  for (const [nom, f] of Object.entries(FORMATS)) {
    const largeur = f.marges.gauche +
      f.grille.colonnes * f.etiquette.largeur +
      (f.grille.colonnes - 1) * f.ecart.colonnes;
    const hauteur = f.marges.haut +
      f.grille.lignes * f.etiquette.hauteur +
      (f.grille.lignes - 1) * f.ecart.lignes;

    assert.ok(largeur <= f.page.largeur, nom + ' deborde en largeur : ' + largeur.toFixed(1) + ' mm');
    assert.ok(hauteur <= f.page.hauteur, nom + ' deborde en hauteur : ' + hauteur.toFixed(1) + ' mm');
  }
});

test('chaque article donne autant d etiquettes qu on en demande', () => {
  const { etiquettes } = preparer([
    { ...NUTELLA, quantite: 3 }, { ...COCA, quantite: 2 },
  ]);
  assert.equal(etiquettes.length, 5);
  assert.equal(etiquettes.filter((e) => e.codeBarres === NUTELLA.codeBarres).length, 3);
});

test('ce qui ne se dessine pas est ecarte, avec son motif', () => {
  const { etiquettes, ecartes } = preparer([
    { ...NUTELLA, quantite: 1 }, { ...SANS_CODE, quantite: 4 }, { ...INTERNE, quantite: 2 },
  ]);
  assert.equal(etiquettes.length, 1);
  assert.deepEqual(ecartes.map((e) => e.motif), [
    'pas de code-barres', 'code interne, sans trace normalise',
  ]);
});

test('un nombre d exemplaires aberrant est refuse', () => {
  assert.throws(() => preparer([{ ...NUTELLA, quantite: 0 }]), /invalide/);
  assert.throws(() => preparer([{ ...NUTELLA, quantite: 2.5 }]), /invalide/);
});

test('la planche se pagine selon la grille du format', () => {
  const parPage = FORMATS['a4-65'].grille.colonnes * FORMATS['a4-65'].grille.lignes;
  const page = construirePage({
    articles: [{ ...NUTELLA, quantite: parPage + 1 }], format: 'a4-65',
  });
  assert.equal(page.nombreEtiquettes, parPage + 1);
  assert.equal(page.nombrePages, 2);
  assert.equal(page.html.match(/class="planche"/g).length, 2);
});

test('le rouleau ne porte qu une etiquette par page', () => {
  const page = construirePage({
    articles: [{ ...NUTELLA, quantite: 3 }], format: 'rouleau-40x30',
  });
  assert.equal(page.nombrePages, 3);
  assert.match(page.html, /@page \{ size: 40mm 30mm/);
});

test('le prix ne figure que si on le demande', () => {
  const avec = construirePage({ articles: [{ ...NUTELLA, quantite: 1 }], avecPrix: true });
  const sans = construirePage({ articles: [{ ...NUTELLA, quantite: 1 }], avecPrix: false });
  assert.match(avec.html, /3 500 F/);
  assert.doesNotMatch(sans.html, /3 500 F/);
});

test('une planche sans rien a imprimer est refusee, pas vide', () => {
  assert.throws(() => construirePage({ articles: [] }), /Aucune etiquette/);
  assert.throws(
    () => construirePage({ articles: [{ ...SANS_CODE, quantite: 2 }] }),
    /aucun des articles choisis/
  );
});

test('un format inconnu est refuse', () => {
  assert.throws(
    () => construirePage({ articles: [{ ...NUTELLA, quantite: 1 }], format: 'a3-mille' }),
    /Format d etiquettes inconnu/
  );
});

test('une designation ne peut pas injecter de balise dans la planche', () => {
  const page = construirePage({
    articles: [{ ...NUTELLA, designation: '<script>alert(1)</script>', quantite: 1 }],
    boutique: { nom: 'Chez "Awa" & fils' },
  });
  assert.doesNotMatch(page.html, /<script>alert/);
  assert.match(page.html, /&lt;script&gt;/);
  assert.match(page.html, /Chez &quot;Awa&quot; &amp; fils/);
});

test('la planche porte un code-barres dessine par etiquette', () => {
  const page = construirePage({ articles: [{ ...NUTELLA, quantite: 4 }] });
  assert.equal(page.html.match(/<svg class="code-barres"/g).length, 4);
});

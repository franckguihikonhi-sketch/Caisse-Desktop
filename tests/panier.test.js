'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculer, repartirArrondi } = require('../src/metier/panier');

const SAVON = { reference: 'A1', designation: 'Savon', prixUnitaire: 325, quantite: 3, tauxTva: 18 };
const RIZ = { reference: 'A2', designation: 'Riz', prixUnitaire: 4500, quantite: 1, tauxTva: 18 };
const PAIN = { reference: 'A3', designation: 'Pain', prixUnitaire: 200, quantite: 2, tauxTva: 0 };

test("l'arrondi reparti conserve la somme", () => {
  assert.deepEqual(repartirArrondi([0.5, 0.5, 0.5]), [1, 1, 0]);
  assert.equal(repartirArrondi([1.4, 1.4, 1.4]).reduce((s, v) => s + v, 0), 4);
  assert.deepEqual(repartirArrondi([10, 20]), [10, 20]);
});

test('la somme des lignes fait exactement le total', () => {
  const r = calculer([SAVON, { ...RIZ, remisePourcent: 10 }, PAIN]);
  assert.equal(r.lignes.reduce((s, l) => s + l.totalTtc, 0), r.totalTtc);
});

test('base HT et TVA se recomposent en TTC, sans franc perdu', () => {
  const r = calculer([SAVON, RIZ, PAIN]);
  assert.equal(r.totalHt + r.totalTva, r.totalTtc);
  for (const v of r.ventilation) assert.equal(v.base + v.tva, v.ttc);
});

test('chaque taux de TVA est ventile separement', () => {
  const r = calculer([SAVON, PAIN]);
  assert.deepEqual(r.ventilation.map((v) => v.taux), [18, 0]);
  assert.equal(r.ventilation.find((v) => v.taux === 0).tva, 0);
});

test('la remise de ligne ne touche que sa ligne', () => {
  const r = calculer([SAVON, { ...RIZ, remisePourcent: 50 }]);
  assert.equal(r.lignes[0].totalTtc, 975);
  assert.equal(r.lignes[1].totalTtc, 2250);
  assert.equal(r.remise, 2250);
});

test('la remise globale se repartit sans casser le total', () => {
  const r = calculer([SAVON, RIZ, PAIN], { remiseGlobalePourcent: 7 });
  assert.equal(r.lignes.reduce((s, l) => s + l.totalTtc, 0), r.totalTtc);
  assert.equal(r.totalTtc, Math.round((975 + 4500 + 400) * 0.93));
  assert.equal(r.totalBrut - r.remise, r.totalTtc);
});

test('un panier vide est un panier a zero, pas une erreur', () => {
  const r = calculer([]);
  assert.equal(r.totalTtc, 0);
  assert.equal(r.nombreArticles, 0);
});

test('les saisies aberrantes sont refusees', () => {
  assert.throws(() => calculer([{ ...SAVON, quantite: 0 }]), /entier positif/);
  assert.throws(() => calculer([{ ...SAVON, quantite: 1.5 }]), /entier positif/);
  assert.throws(() => calculer([{ ...SAVON, prixUnitaire: -1 }]), /prix unitaire/);
  assert.throws(() => calculer([{ ...SAVON, remisePourcent: 120 }]), /remise/);
  assert.throws(() => calculer([SAVON], { remiseGlobalePourcent: -5 }), /Remise globale/);
});

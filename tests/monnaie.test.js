'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { arrondirEspeces, formater, rendreMonnaie, COUPURES } = require('../src/metier/monnaie');

test('un montant en especes tombe sur un multiple de 5 francs', () => {
  assert.equal(arrondirEspeces(1002), 1000);
  assert.equal(arrondirEspeces(1003), 1005);
  assert.equal(arrondirEspeces(1000), 1000);
});

test('les milliers sont separes pour la lecture', () => {
  assert.equal(formater(0), '0 F');
  assert.equal(formater(999), '999 F');
  assert.equal(formater(1000), '1 000 F');
  assert.equal(formater(1234567), '1 234 567 F');
  assert.equal(formater(-500), '-500 F');
});

test('la monnaie rendue se decompose en coupures reelles', () => {
  const { rendu, detail } = rendreMonnaie(7325, 10000);
  assert.equal(rendu, 2675);
  assert.deepEqual(detail, [
    { coupure: 2000, nombre: 1 },
    { coupure: 500, nombre: 1 },
    { coupure: 100, nombre: 1 },
    { coupure: 50, nombre: 1 },
    { coupure: 25, nombre: 1 },
  ]);
});

test('le detail des coupures redonne toujours le montant rendu', () => {
  for (let du = 5; du <= 20000; du += 5) {
    const recu = Math.ceil(du / 500) * 500;
    const { rendu, detail } = rendreMonnaie(du, recu);
    const somme = detail.reduce((s, d) => s + d.coupure * d.nombre, 0);
    assert.equal(somme, rendu, 'du=' + du + ' recu=' + recu);
  }
});

test('un paiement insuffisant est refuse, pas arrondi', () => {
  assert.throws(() => rendreMonnaie(5000, 4500), /insuffisant/);
});

test('les coupures vont de la plus grosse a la plus petite', () => {
  assert.deepEqual([...COUPURES].sort((a, b) => b - a), COUPURES);
});

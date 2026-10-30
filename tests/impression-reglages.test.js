'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const reglages = require('../src/metier/impression-reglages');
const { pageTicket } = require('../src/metier/page-impression');
const { construireTicket, venteExemple } = require('../src/metier/ticket');
const { ouvrir, lireParametres } = require('../src/donnees/base');

test('les reglages par defaut visent un rouleau 58 mm en mode texte', () => {
  const r = reglages.normaliser();
  assert.equal(r.largeurMm, 58);
  assert.equal(r.mode, 'texte');
  assert.equal(r.silencieuse, false);
  assert.equal(r.taillePolice, 12);
});

test('une largeur ou un mode fantaisiste retombe sur une valeur sure', () => {
  const r = reglages.normaliser({
    'impression.largeur_mm': '117', 'impression.mode': 'laser', 'impression.taille_police': '999',
  });
  assert.equal(r.largeurMm, 58);
  assert.equal(r.mode, 'texte');
  assert.equal(r.taillePolice, 20);
});

test('les reglages de la base sont relus tels quels', () => {
  const r = reglages.normaliser({
    'impression.largeur_mm': '80', 'impression.mode': 'image',
    'impression.silencieuse': 'oui', 'impression.taille_police': '14',
  });
  assert.deepEqual(r, { largeurMm: 80, mode: 'image', silencieuse: true, taillePolice: 14 });
});

test('la hauteur de page suit le nombre de lignes sans descendre sous un minimum', () => {
  const r = reglages.normaliser();
  assert.equal(reglages.hauteurMm(1, r), 40);
  assert.ok(reglages.hauteurMm(120, r) > reglages.hauteurMm(40, r));
});

test('le format envoye au pilote est exprime en microns', () => {
  const format = reglages.formatImpression(30, reglages.normaliser({ 'impression.largeur_mm': '80' }));
  assert.equal(format.width, 80000);
  assert.ok(format.height >= 40000);
});

test('le format PDF est exprime en pouces', () => {
  const format = reglages.formatPdf(30, reglages.normaliser());
  assert.ok(Math.abs(format.width - 58 / 25.4) < 0.001);
});

test('la page du ticket declare un format, un fond blanc et le texte du ticket', () => {
  const lignes = construireTicket({ boutique: { nom: 'KS-MARKET' }, vente: venteExemple() });
  const html = pageTicket(lignes, reglages.normaliser());

  assert.match(html, /@page \{ size: 58mm \d+mm; margin: 0; \}/);
  assert.match(html, /color: #000/);
  assert.ok(html.includes('KS-MARKET'));
  assert.ok(html.includes('TOTAL'));
});

test('la page du ticket suit la largeur 80 mm quand elle est choisie', () => {
  const lignes = construireTicket({ boutique: { nom: 'Boutique' }, vente: venteExemple() });
  const html = pageTicket(lignes, reglages.normaliser({ 'impression.largeur_mm': '80' }));
  assert.match(html, /@page \{ size: 80mm/);
  assert.match(html, /width: 80mm/);
});

test('une base neuve contient les reglages d impression', () => {
  const bd = ouvrir(':memory:');
  const parametres = lireParametres(bd);
  assert.equal(parametres['impression.largeur_mm'], '58');
  assert.equal(parametres['impression.mode'], 'texte');
  assert.equal(reglages.normaliser(parametres).taillePolice, 12);
  bd.close();
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { GUIDE_UTILISATEUR, rechercherGuide } = require('../src/metier/guide-utilisateur');

test('le guide utilisateur couvre les procedures principales', () => {
  const ids = new Set(GUIDE_UTILISATEUR.map((section) => section.id));
  for (const attendu of [
    'premier-demarrage',
    'vente-caisse',
    'articles-achats-stock',
    'credits-clients-fournisseurs',
    'tableau-benefices',
    'securite-audit',
    'sauvegarde-reseau',
  ]) {
    assert.equal(ids.has(attendu), true, attendu);
  }

  for (const section of GUIDE_UTILISATEUR) {
    assert.ok(section.titre);
    assert.ok(section.resume);
    assert.ok(section.etapes.length >= 3, section.titre);
  }
});

test('la recherche du guide trouve les themes utiles au comptoir', () => {
  assert.equal(rechercherGuide(GUIDE_UTILISATEUR, 'vente stock').some((section) => section.id === 'vente-caisse'), true);
  assert.equal(rechercherGuide(GUIDE_UTILISATEUR, 'reseau sauvegarde').some((section) => section.id === 'sauvegarde-reseau'), true);
  assert.equal(rechercherGuide(GUIDE_UTILISATEUR, 'motif annulation').some((section) => section.id === 'securite-audit'), true);
  assert.deepEqual(rechercherGuide(GUIDE_UTILISATEUR, 'mot-introuvable-xyz'), []);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const audit = require('../src/donnees/audit');

test('le journal audit enregistre et filtre les actions sensibles', () => {
  const base = ouvrir(':memory:');
  const admin = utilisateurs.authentifier(base, 'CIV', 'CIV');

  const ligne = audit.enregistrer(base, {
    utilisateur: admin,
    action: 'test_action',
    entite: 'article',
    entiteId: 42,
    resume: 'Modification de controle',
    details: { champ: 'prix', avant: 100, apres: 120 },
  });

  assert.equal(ligne.utilisateurNom, admin.nom);
  assert.equal(ligne.utilisateurRole, 'administrateur');
  assert.equal(ligne.action, 'test_action');
  assert.deepEqual(ligne.details, { champ: 'prix', avant: 100, apres: 120 });

  const parEntite = audit.lister(base, { entite: 'article' });
  assert.equal(parEntite.length, 1);
  assert.equal(parEntite[0].entiteId, 42);

  const recherche = audit.lister(base, { recherche: 'controle' });
  assert.equal(recherche.length, 1);

  const resume = audit.resume(base);
  assert.equal(resume.total, 1);
  assert.equal(resume.dernier.action, 'test_action');
});

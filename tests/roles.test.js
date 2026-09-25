'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');

test('les profils utilisateurs portent des permissions metier explicites', () => {
  const base = ouvrir(':memory:');
  const gerant = utilisateurs.creer(base, {
    identifiant: 'gerant', nom: 'Gerant', role: 'gerant', motDePasse: 'secret123',
  });
  const stock = utilisateurs.creer(base, {
    identifiant: 'stock', nom: 'Stock', role: 'stock', motDePasse: 'secret123',
  });
  const comptable = utilisateurs.creer(base, {
    identifiant: 'compta', nom: 'Comptable', role: 'comptable', motDePasse: 'secret123',
  });
  const caissier = utilisateurs.creer(base, {
    identifiant: 'caisse', nom: 'Caissier', role: 'caissier', motDePasse: 'secret123',
  });

  assert.equal(gerant.role, 'gerant');
  assert.ok(utilisateurs.aPermission(gerant, utilisateurs.PERMISSIONS.VENTE_ANNULER));
  assert.ok(utilisateurs.aPermission(gerant, utilisateurs.PERMISSIONS.RAPPORTS_EXPORTS));
  assert.equal(utilisateurs.aPermission(gerant, utilisateurs.PERMISSIONS.UTILISATEURS_GERER), false);
  assert.equal(utilisateurs.aPermission(gerant, utilisateurs.PERMISSIONS.BASE_GERER), false);

  assert.ok(utilisateurs.aPermission(stock, utilisateurs.PERMISSIONS.ACHATS_GERER));
  assert.ok(utilisateurs.aPermission(stock, utilisateurs.PERMISSIONS.STOCK_MOUVEMENT));
  assert.equal(utilisateurs.aPermission(stock, utilisateurs.PERMISSIONS.VENTE_ENCAISSER), false);

  assert.ok(utilisateurs.aPermission(comptable, utilisateurs.PERMISSIONS.CLIENTS_REGLER));
  assert.ok(utilisateurs.aPermission(comptable, utilisateurs.PERMISSIONS.RAPPORTS_BENEFICES));
  assert.equal(utilisateurs.aPermission(comptable, utilisateurs.PERMISSIONS.ACHATS_GERER), false);

  assert.ok(utilisateurs.aPermission(caissier, utilisateurs.PERMISSIONS.VENTE_ENCAISSER));
  assert.equal(utilisateurs.aPermission(caissier, utilisateurs.PERMISSIONS.VENTE_ANNULER), false);

  const reconnecte = utilisateurs.authentifier(base, 'stock', 'secret123');
  assert.equal(reconnecte.role, 'stock');
  assert.deepEqual(reconnecte.permissions, stock.permissions);
});

test('le compte CIV standard reste administrateur complet', () => {
  const base = ouvrir(':memory:');
  const civ = utilisateurs.authentifier(base, 'CIV', 'CIV');
  assert.equal(civ.role, 'administrateur');
  assert.ok(utilisateurs.aPermission(civ, utilisateurs.PERMISSIONS.UTILISATEURS_GERER));
  assert.ok(utilisateurs.aPermission(civ, utilisateurs.PERMISSIONS.BASE_GERER));
  assert.ok(utilisateurs.rolesDisponibles().some((role) => role.code === 'comptable'));
});

test('un role inconnu est refuse', () => {
  const base = ouvrir(':memory:');
  assert.throws(() => utilisateurs.creer(base, {
    identifiant: 'invite', nom: 'Invite', role: 'invite', motDePasse: 'secret123',
  }), /Role inconnu/);
});

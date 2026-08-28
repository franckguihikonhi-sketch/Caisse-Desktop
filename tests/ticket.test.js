'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculer } = require('../src/metier/panier');
const { construireTicket, justifier, LARGEUR } = require('../src/metier/ticket');

const BOUTIQUE = { nom: 'Chez Awa', adresse: 'Abidjan', telephone: '07 00 00 00 00' };

function ticketExemple(paiement = { mode: 'especes', montantRecu: 6000, rendu: 975 }) {
  const panier = calculer([
    { reference: 'SAV', designation: 'Savon de Marseille', prixUnitaire: 325, quantite: 3, tauxTva: 18 },
    { reference: 'RIZ', designation: 'Riz 5 kg', prixUnitaire: 4500, quantite: 1, tauxTva: 18, remisePourcent: 10 },
  ]);
  return construireTicket({
    boutique: BOUTIQUE,
    vente: { numero: 'V-20260828-0007', date: '2026-08-28T14:32:00', caissier: 'Awa', panier, paiement },
  });
}

test('aucune ligne ne depasse la largeur du rouleau', () => {
  for (const ligne of ticketExemple()) {
    assert.ok(ligne.length <= LARGEUR, 'ligne trop longue : ' + JSON.stringify(ligne));
  }
});

test('une designation trop longue est coupee, pas renvoyee a la ligne', () => {
  const long = justifier('x'.repeat(60), '1 000 F');
  assert.equal(long.length, LARGEUR);
  assert.ok(long.endsWith('1 000 F'));
});

test('le ticket porte le total, la remise et la ventilation de TVA', () => {
  const texte = ticketExemple().join('\n');
  assert.match(texte, /TOTAL {2,}5 025 F/);
  assert.match(texte, /Remise {2,}-450 F/);
  assert.match(texte, /TVA 18 %/);
  assert.match(texte, /Monnaie rendue {2,}975 F/);
});

test('la monnaie rendue ne figure que sur un paiement en especes', () => {
  const carte = ticketExemple({ mode: 'carte' }).join('\n');
  assert.doesNotMatch(carte, /Monnaie rendue/);
  assert.match(carte, /Carte bancaire/);
});

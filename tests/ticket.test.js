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

test('le ticket porte le total et la remise sans bloc taxes ni paiement', () => {
  const texte = ticketExemple().join('\n');
  assert.match(texte, /TOTAL {2,}5 025 F/);
  assert.match(texte, /Remise {2,}-450 F/);
  assert.doesNotMatch(texte, /HT 18 %/);
  assert.doesNotMatch(texte, /TVA 18 %/);
  assert.doesNotMatch(texte, /Especes/);
  assert.doesNotMatch(texte, /Monnaie rendue/);
});

test('aucun mode de paiement ne s imprime sur le ticket', () => {
  const carte = ticketExemple({ mode: 'carte' }).join('\n');
  assert.doesNotMatch(carte, /Monnaie rendue/);
  assert.doesNotMatch(carte, /Carte bancaire/);
});

test('le ticket credit porte les factures ouvertes du debiteur', () => {
  const panier = calculer([
    { reference: 'EAU', designation: 'Eau minerale', prixUnitaire: 300, quantite: 2, tauxTva: 0 },
  ]);
  const texte = construireTicket({
    boutique: BOUTIQUE,
    vente: {
      numero: 'V-20260922-0003',
      date: '2026-09-22T10:00:00',
      caissier: 'Awa',
      client: { nom: 'Client Pro' },
      panier,
      paiement: { mode: 'credit' },
      creditClient: {
        factures: [
          { numero: 'V-20260920-0001', solde: 1200 },
          { numero: 'V-20260922-0003', solde: 600 },
        ],
        totalSolde: 1800,
      },
    },
  }).join('\n');

  assert.match(texte, /Factures a credit/);
  assert.match(texte, /V-20260920-0001 {2,}1 200 F/);
  assert.match(texte, /V-20260922-0003 {2,}600 F/);
  assert.match(texte, /Dette totale {2,}1 800 F/);
});

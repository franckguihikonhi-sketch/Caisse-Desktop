'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrir, boutique, ecrireParametres } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const ventes = require('../src/donnees/ventes');
const { jour } = require('../src/metier/horodatage');

function caisseNeuve() {
  const base = ouvrir(':memory:');
  const caissier = utilisateurs.creer(base, {
    identifiant: 'awa', nom: 'Awa Kone', role: 'caissier', motDePasse: 'secret123',
  });
  articles.creer(base, { reference: 'sav-01', designation: 'Savon', prixUnitaire: 325, stock: 100 });
  articles.creer(base, { reference: 'riz-05', designation: 'Riz 5 kg', prixUnitaire: 4500, stock: 20 });
  articles.creer(base, { reference: 'pain', designation: 'Pain', prixUnitaire: 200, tauxTva: 0, stock: 50 });
  return { base, caissier };
}

test('la premiere ouverture ne cree aucun compte', () => {
  const base = ouvrir(':memory:');
  assert.equal(utilisateurs.aucunCompte(base), true);
  assert.equal(boutique(base).nom, 'Ma boutique');
});

test('un mot de passe ne se retrouve pas dans la base', () => {
  const { base } = caisseNeuve();
  const brut = JSON.stringify(base.prepare('SELECT * FROM utilisateurs').all());
  assert.ok(!brut.includes('secret123'));
});

test('seul le bon mot de passe ouvre la caisse', () => {
  const { base } = caisseNeuve();
  assert.equal(utilisateurs.authentifier(base, 'awa', 'secret123').nom, 'Awa Kone');
  assert.equal(utilisateurs.authentifier(base, 'AWA', 'secret123').nom, 'Awa Kone');
  assert.equal(utilisateurs.authentifier(base, 'awa', 'secret124'), null);
  assert.equal(utilisateurs.authentifier(base, 'inconnu', 'secret123'), null);
});

test('un compte desactive ne peut plus ouvrir la caisse', () => {
  const { base, caissier } = caisseNeuve();
  utilisateurs.activer(base, caissier.id, false);
  assert.equal(utilisateurs.authentifier(base, 'awa', 'secret123'), null);
});

test('les references sont uniques et normalisees', () => {
  const { base } = caisseNeuve();
  assert.equal(articles.lireParReference(base, 'sav-01').reference, 'SAV-01');
  assert.throws(() => articles.creer(base, {
    reference: 'SAV-01', designation: 'Doublon', prixUnitaire: 100,
  }), /existe deja/);
});

test('la recherche trouve par reference comme par designation', () => {
  const { base } = caisseNeuve();
  assert.equal(articles.chercher(base, 'riz').length, 1);
  assert.equal(articles.chercher(base, 'RIZ-05').length, 1);
  assert.equal(articles.chercher(base, 'zzz').length, 0);
});

test('une vente decompte le stock et se relit a l identique', () => {
  const { base, caissier } = caisseNeuve();
  const vendue = ventes.enregistrer(base, {
    lignes: [{ reference: 'SAV-01', quantite: 3 }, { reference: 'PAIN', quantite: 2 }],
    paiement: { mode: 'especes', montantRecu: 2000 },
    utilisateurId: caissier.id,
  });

  assert.equal(vendue.numero, 'V-' + jour().replace(/-/g, '') + '-0001');
  assert.equal(vendue.panier.totalTtc, 1375);
  assert.equal(vendue.paiement.rendu, 625);
  assert.equal(articles.lireParReference(base, 'SAV-01').stock, 97);
  assert.equal(articles.lireParReference(base, 'PAIN').stock, 48);

  const relue = ventes.lire(base, vendue.id);
  assert.equal(relue.panier.totalTtc, vendue.panier.totalTtc);
  assert.equal(relue.panier.totalHt + relue.panier.totalTva, relue.panier.totalTtc);
  assert.equal(relue.caissier, 'Awa Kone');
});

test('les ventes du jour se numerotent a la suite', () => {
  const { base, caissier } = caisseNeuve();
  const commande = {
    lignes: [{ reference: 'PAIN', quantite: 1 }],
    paiement: { mode: 'carte' },
    utilisateurId: caissier.id,
  };
  assert.match(ventes.enregistrer(base, commande).numero, /-0001$/);
  assert.match(ventes.enregistrer(base, commande).numero, /-0002$/);
  assert.match(ventes.enregistrer(base, commande).numero, /-0003$/);
});

test('le prix vient de la base, pas du panier envoye', () => {
  const { base, caissier } = caisseNeuve();
  const vendue = ventes.enregistrer(base, {
    lignes: [{ reference: 'PAIN', quantite: 1, prixUnitaire: 1, tauxTva: 0 }],
    paiement: { mode: 'carte' },
    utilisateurId: caissier.id,
  });
  assert.equal(vendue.panier.totalTtc, 200);
});

test('un stock insuffisant annule toute la vente', () => {
  const { base, caissier } = caisseNeuve();
  assert.throws(() => ventes.enregistrer(base, {
    lignes: [{ reference: 'SAV-01', quantite: 2 }, { reference: 'RIZ-05', quantite: 999 }],
    paiement: { mode: 'carte' },
    utilisateurId: caissier.id,
  }), /Stock insuffisant/);

  assert.equal(articles.lireParReference(base, 'SAV-01').stock, 100);
  assert.equal(base.prepare('SELECT COUNT(*) AS n FROM ventes').get().n, 0);
});

test('un article inconnu ou un paiement inconnu est refuse', () => {
  const { base, caissier } = caisseNeuve();
  const commande = { paiement: { mode: 'carte' }, utilisateurId: caissier.id };
  assert.throws(() => ventes.enregistrer(base, {
    ...commande, lignes: [{ reference: 'FANTOME', quantite: 1 }],
  }), /Article inconnu/);
  assert.throws(() => ventes.enregistrer(base, {
    lignes: [{ reference: 'PAIN', quantite: 1 }],
    paiement: { mode: 'cheque' }, utilisateurId: caissier.id,
  }), /Mode de paiement inconnu/);
  assert.throws(() => ventes.enregistrer(base, { ...commande, lignes: [] }), /panier est vide/);
});

test('un paiement en especes insuffisant est refuse et rien n est ecrit', () => {
  const { base, caissier } = caisseNeuve();
  assert.throws(() => ventes.enregistrer(base, {
    lignes: [{ reference: 'RIZ-05', quantite: 1 }],
    paiement: { mode: 'especes', montantRecu: 1000 },
    utilisateurId: caissier.id,
  }), /insuffisant/);
  assert.equal(base.prepare('SELECT COUNT(*) AS n FROM ventes').get().n, 0);
  assert.equal(articles.lireParReference(base, 'RIZ-05').stock, 20);
});

test('la cloture du jour additionne exactement les ventes', () => {
  const { base, caissier } = caisseNeuve();
  ventes.enregistrer(base, {
    lignes: [{ reference: 'SAV-01', quantite: 3 }],
    paiement: { mode: 'especes', montantRecu: 1000 }, utilisateurId: caissier.id,
  });
  ventes.enregistrer(base, {
    lignes: [{ reference: 'PAIN', quantite: 2 }],
    paiement: { mode: 'mobile' }, utilisateurId: caissier.id,
  });

  const z = ventes.cloture(base, jour());
  assert.equal(z.nombreVentes, 2);
  assert.equal(z.totalTtc, 975 + 400);
  assert.equal(z.totalHt + z.totalTva, z.totalTtc);
  assert.deepEqual(z.parPaiement.map((p) => p.mode).sort(), ['especes', 'mobile']);
  assert.deepEqual(z.parTaux.map((t) => t.taux), [18, 0]);
  assert.equal(ventes.journal(base, jour()).length, 2);
});

test('annuler une vente remet le stock et la sort de la cloture', () => {
  const { base, caissier } = caisseNeuve();
  const vendue = ventes.enregistrer(base, {
    lignes: [{ reference: 'RIZ-05', quantite: 2 }],
    paiement: { mode: 'carte' }, utilisateurId: caissier.id,
  });
  assert.equal(articles.lireParReference(base, 'RIZ-05').stock, 18);

  const annulee = ventes.annuler(base, vendue.id, 'erreur de saisie');
  assert.equal(annulee.annulee, true);
  assert.equal(articles.lireParReference(base, 'RIZ-05').stock, 20);

  const z = ventes.cloture(base, jour());
  assert.equal(z.nombreVentes, 0);
  assert.equal(z.totalTtc, 0);
  assert.equal(z.ventesAnnulees, 1);
  assert.throws(() => ventes.annuler(base, vendue.id, 'encore'), /deja annulee/);
});

test('les parametres de la boutique se relisent apres ecriture', () => {
  const base = ouvrir(':memory:');
  ecrireParametres(base, { 'boutique.nom': 'Chez Awa', 'boutique.telephone': '07 00 00 00 00' });
  assert.equal(boutique(base).nom, 'Chez Awa');
  assert.equal(boutique(base).telephone, '07 00 00 00 00');
});

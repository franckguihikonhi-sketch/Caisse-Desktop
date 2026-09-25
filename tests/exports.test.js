'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const fournisseurs = require('../src/donnees/fournisseurs');
const caisse = require('../src/donnees/caisse');
const achats = require('../src/donnees/achats');
const ventes = require('../src/donnees/ventes');
const exportsRapports = require('../src/principal/exports');

test('l export CSV cree les rapports Excel attendus', () => {
  const base = ouvrir(':memory:');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ivoire-exports-'));
  const jour = new Date().toISOString().slice(0, 10);

  const admin = utilisateurs.creer(base, {
    identifiant: 'admin', nom: 'Administrateur', role: 'administrateur', motDePasse: 'secret123',
  });
  const fournisseur = fournisseurs.creer(base, { nom: 'Grossiste Export' });
  const article = articles.creer(base, {
    reference: 'EXP-1', designation: 'Article export', prixUnitaire: 1500, stock: 0,
  });
  achats.enregistrer(base, {
    fournisseurId: fournisseur.id,
    dateAchat: jour,
    referenceDocument: 'FAC-EXPORT',
    modeReglement: 'credit',
    utilisateurId: admin.id,
    lignes: [{ articleId: article.id, uniteAchat: 'piece', quantite: 8, prixAchatUnitaire: 1000 }],
  });
  caisse.ouvrir(base, { fondOuverture: 0, utilisateurId: admin.id });
  ventes.enregistrer(base, {
    lignes: [{ reference: 'EXP-1', quantite: 2 }],
    paiement: { mode: 'carte' },
    utilisateurId: admin.id,
  });

  const resultat = exportsRapports.exporterCsv(base, dossier, { jour });
  assert.equal(resultat.nombreFichiers, 7);
  assert.ok(fs.existsSync(path.join(resultat.dossier, 'articles-stock.csv')));
  assert.ok(fs.existsSync(path.join(resultat.dossier, 'ventes-du-jour.csv')));
  assert.ok(fs.existsSync(path.join(resultat.dossier, 'benefices-par-facture.csv')));

  const articlesCsv = fs.readFileSync(path.join(resultat.dossier, 'articles-stock.csv'), 'utf8');
  const ventesCsv = fs.readFileSync(path.join(resultat.dossier, 'ventes-du-jour.csv'), 'utf8');
  const beneficesCsv = fs.readFileSync(path.join(resultat.dossier, 'benefices-par-facture.csv'), 'utf8');

  assert.match(articlesCsv, /Reference;Designation/);
  assert.match(articlesCsv, /EXP-1;Article export/);
  assert.match(ventesCsv, /Montant net/);
  assert.match(beneficesCsv, /FAC-EXPORT/);
  assert.match(beneficesCsv, /Article export/);

  base.close();
  fs.rmSync(dossier, { recursive: true, force: true });
});

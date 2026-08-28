'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { migrer } = require('./migrations');

const PARAMETRES_PAR_DEFAUT = {
  'boutique.nom': 'Ma boutique',
  'boutique.adresse': '',
  'boutique.telephone': '',
  'boutique.numeroContribuable': '',
  'tva.taux_par_defaut': '18',
};

/**
 * Ouvre la base et lui applique les migrations qui lui manquent. Passer
 * ':memory:' donne une base jetable, ce dont les tests se servent.
 */
function ouvrir(chemin) {
  if (chemin !== ':memory:') {
    fs.mkdirSync(path.dirname(chemin), { recursive: true });
  }
  const base = new Database(chemin);
  base.pragma('journal_mode = WAL');
  base.pragma('foreign_keys = ON');

  migrer(base);

  const poser = base.prepare(
    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO NOTHING'
  );
  const semer = base.transaction(() => {
    for (const [cle, valeur] of Object.entries(PARAMETRES_PAR_DEFAUT)) poser.run(cle, valeur);
  });
  semer();

  return base;
}

function lireParametres(base) {
  const lignes = base.prepare('SELECT cle, valeur FROM parametres').all();
  return Object.fromEntries(lignes.map((l) => [l.cle, l.valeur]));
}

function ecrireParametres(base, valeurs) {
  const poser = base.prepare(
    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ' +
      'ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur'
  );
  base.transaction(() => {
    for (const [cle, valeur] of Object.entries(valeurs)) poser.run(cle, String(valeur));
  })();
}

function boutique(base) {
  const p = lireParametres(base);
  return {
    nom: p['boutique.nom'],
    adresse: p['boutique.adresse'],
    telephone: p['boutique.telephone'],
    numeroContribuable: p['boutique.numeroContribuable'],
  };
}

module.exports = { ouvrir, lireParametres, ecrireParametres, boutique, PARAMETRES_PAR_DEFAUT };

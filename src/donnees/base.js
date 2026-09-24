'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BaseSqlite } = require('./sqlite');

const utilisateurs = require('./utilisateurs');
const { migrer, DERNIERE_VERSION } = require('./migrations');

const PARAMETRES_PAR_DEFAUT = {
  'boutique.nom': 'Ma boutique',
  'boutique.adresse': '',
  'boutique.telephone': '',
  'boutique.numeroContribuable': '',
  'tva.taux_par_defaut': '18',
  // Numero d'ordre du prochain code-barres d'usage interne a attribuer.
  'codeBarres.prochain_interne': '1',
};

function horodatageFichier() {
  const maintenant = new Date();
  const deux = (n) => String(n).padStart(2, '0');
  const trois = (n) => String(n).padStart(3, '0');
  return String(maintenant.getFullYear()) + deux(maintenant.getMonth() + 1) + deux(maintenant.getDate()) +
    '-' + deux(maintenant.getHours()) + deux(maintenant.getMinutes()) + deux(maintenant.getSeconds()) +
    '-' + trois(maintenant.getMilliseconds());
}

function sqlTexte(valeur) {
  return "'" + String(valeur).replace(/'/g, "''") + "'";
}

function sauvegarderAvantMigration(base, chemin, versionActuelle) {
  const dossier = path.join(path.dirname(chemin), 'sauvegardes-auto');
  fs.mkdirSync(dossier, { recursive: true });
  const nom = path.basename(chemin, path.extname(chemin)) || 'caisse';
  const cible = path.join(
    dossier,
    nom + '-avant-migration-v' + versionActuelle + '-' + horodatageFichier() + '.db'
  );
  // VACUUM INTO produit une copie SQLite coherente, plus sure qu'une copie brute
  // si l'ancien fichier avait un journal WAL a consolider.
  base.exec('VACUUM INTO ' + sqlTexte(cible));
  return cible;
}

function verifierIntegrite(base) {
  const resultat = base.pragma('quick_check', { simple: true });
  if (resultat !== 'ok') {
    throw new Error('Controle integrite SQLite echoue : ' + resultat);
  }
}

/**
 * Ouvre la base et lui applique les migrations qui lui manquent. Passer
 * ':memory:' donne une base jetable, ce dont les tests se servent.
 */
function ouvrir(chemin, options = {}) {
  const persistant = chemin !== ':memory:';
  const fichierExistant = persistant && fs.existsSync(chemin);
  if (persistant) {
    fs.mkdirSync(path.dirname(chemin), { recursive: true });
  }
  const base = new BaseSqlite(chemin);
  base.pragma('busy_timeout = ' + (options.attenteVerrouMs ?? 15000));
  base.pragma(options.reseau ? 'journal_mode = DELETE' : 'journal_mode = WAL');
  base.pragma('foreign_keys = ON');

  const versionAvant = Number(base.pragma('user_version', { simple: true }) || 0);
  if (fichierExistant && versionAvant > 0 && versionAvant < DERNIERE_VERSION) {
    sauvegarderAvantMigration(base, chemin, versionAvant);
  }
  migrer(base);
  verifierIntegrite(base);

  const poser = base.prepare(
    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO NOTHING'
  );
  const semer = base.transaction(() => {
    for (const [cle, valeur] of Object.entries(PARAMETRES_PAR_DEFAUT)) poser.run(cle, valeur);
    utilisateurs.assurerAccesStandard(base);
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

module.exports = {
  ouvrir,
  lireParametres,
  ecrireParametres,
  boutique,
  PARAMETRES_PAR_DEFAUT,
  sauvegarderAvantMigration,
  verifierIntegrite,
};

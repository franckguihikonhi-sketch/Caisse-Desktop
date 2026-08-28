'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Evolutions du schema, dans l'ordre. La base retient celle qu'elle a atteinte
 * dans PRAGMA user_version : une caisse deja installee chez un commerçant
 * rattrape les etapes qui lui manquent, sans perdre ses ventes.
 *
 * Une migration publiee ne se modifie plus jamais : les bases qui l'ont deja
 * appliquee ne la rejoueraient pas. Un changement de schema est une migration
 * de plus.
 *
 * schema.sql est l'etape 1 et reste la forme d'origine des tables ; pour lire
 * le schema courant, il faut le lire avec les etapes suivantes.
 */
const MIGRATIONS = [
  {
    version: 1,
    intitule: 'Tables d origine',
    appliquer(base) {
      base.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    },
  },
  {
    version: 2,
    intitule: 'Code-barres des articles',
    appliquer(base) {
      base.exec(`
        ALTER TABLE articles ADD COLUMN code_barres TEXT;

        -- Unicite seulement sur les articles qui en portent un : un catalogue
        -- ou plusieurs articles n'ont pas encore de code-barres reste valide.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_code_barres
          ON articles (code_barres) WHERE code_barres IS NOT NULL;
      `);
    },
  },
];

/** Amene la base au dernier palier et rend le nombre d'etapes appliquees. */
function migrer(base) {
  const depart = base.pragma('user_version', { simple: true });
  let appliquees = 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= depart) continue;
    base.transaction(() => {
      migration.appliquer(base);
      // pragma n'accepte pas de parametre lie : la valeur vient de ce fichier,
      // jamais d'une saisie.
      base.pragma('user_version = ' + migration.version);
    })();
    appliquees += 1;
  }
  return { depart, arrivee: base.pragma('user_version', { simple: true }), appliquees };
}

module.exports = { MIGRATIONS, migrer, DERNIERE_VERSION: MIGRATIONS[MIGRATIONS.length - 1].version };

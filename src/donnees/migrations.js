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
  {
    version: 3,
    intitule: 'Tiers, credits, caisse et mouvements de stock',
    appliquer(base) {
      base.exec(`
        CREATE TABLE IF NOT EXISTS clients (
          id              INTEGER PRIMARY KEY,
          code            TEXT    NOT NULL UNIQUE,
          nom             TEXT    NOT NULL,
          telephone       TEXT,
          adresse         TEXT,
          email           TEXT,
          plafond_credit  INTEGER NOT NULL DEFAULT 0 CHECK (plafond_credit >= 0),
          actif           INTEGER NOT NULL DEFAULT 1,
          cree_le         TEXT    NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients (nom);

        CREATE TABLE IF NOT EXISTS fournisseurs (
          id              INTEGER PRIMARY KEY,
          code            TEXT    NOT NULL UNIQUE,
          nom             TEXT    NOT NULL,
          telephone       TEXT,
          adresse         TEXT,
          email           TEXT,
          actif           INTEGER NOT NULL DEFAULT 1,
          cree_le         TEXT    NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_fournisseurs_nom ON fournisseurs (nom);

        CREATE TABLE IF NOT EXISTS sessions_caisse (
          id                    INTEGER PRIMARY KEY,
          statut                TEXT    NOT NULL CHECK (statut IN ('ouverte', 'fermee')),
          ouverte_le            TEXT    NOT NULL,
          ouvert_par_id         INTEGER NOT NULL REFERENCES utilisateurs (id),
          fond_ouverture        INTEGER NOT NULL CHECK (fond_ouverture >= 0),
          note_ouverture        TEXT,
          fermee_le             TEXT,
          fermee_par_id         INTEGER REFERENCES utilisateurs (id),
          fond_fermeture        INTEGER CHECK (fond_fermeture >= 0),
          total_theorique       INTEGER,
          ecart                 INTEGER,
          note_fermeture        TEXT
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_caisse_ouverte
          ON sessions_caisse (statut) WHERE statut = 'ouverte';

        ALTER TABLE ventes ADD COLUMN caisse_id INTEGER REFERENCES sessions_caisse (id);
        ALTER TABLE ventes ADD COLUMN client_id INTEGER REFERENCES clients (id);
        ALTER TABLE ventes ADD COLUMN paiement_credit INTEGER NOT NULL DEFAULT 0
          CHECK (paiement_credit IN (0, 1));

        CREATE INDEX IF NOT EXISTS idx_ventes_caisse ON ventes (caisse_id);
        CREATE INDEX IF NOT EXISTS idx_ventes_client ON ventes (client_id);
        CREATE INDEX IF NOT EXISTS idx_ventes_credit ON ventes (paiement_credit);

        CREATE TABLE IF NOT EXISTS creances_clients (
          id              INTEGER PRIMARY KEY,
          client_id       INTEGER NOT NULL REFERENCES clients (id),
          vente_id        INTEGER REFERENCES ventes (id),
          numero          TEXT    NOT NULL UNIQUE,
          date_creation   TEXT    NOT NULL,
          date_echeance   TEXT,
          libelle         TEXT    NOT NULL,
          montant_initial INTEGER NOT NULL CHECK (montant_initial >= 0),
          solde           INTEGER NOT NULL CHECK (solde >= 0),
          statut          TEXT    NOT NULL CHECK (statut IN ('ouverte', 'partielle', 'reglee', 'annulee')),
          anterieure      INTEGER NOT NULL DEFAULT 0,
          note            TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_creances_clients_client ON creances_clients (client_id);
        CREATE INDEX IF NOT EXISTS idx_creances_clients_statut ON creances_clients (statut);

        CREATE TABLE IF NOT EXISTS reglements_clients (
          id              INTEGER PRIMARY KEY,
          creance_id      INTEGER NOT NULL REFERENCES creances_clients (id),
          date_reglement  TEXT    NOT NULL,
          montant         INTEGER NOT NULL CHECK (montant > 0),
          mode_paiement   TEXT    NOT NULL CHECK (mode_paiement IN ('especes', 'mobile', 'carte')),
          reference       TEXT,
          utilisateur_id  INTEGER REFERENCES utilisateurs (id),
          caisse_id       INTEGER REFERENCES sessions_caisse (id),
          note            TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_reglements_clients_creance ON reglements_clients (creance_id);
        CREATE INDEX IF NOT EXISTS idx_reglements_clients_caisse ON reglements_clients (caisse_id);

        CREATE TABLE IF NOT EXISTS dettes_fournisseurs (
          id              INTEGER PRIMARY KEY,
          fournisseur_id  INTEGER NOT NULL REFERENCES fournisseurs (id),
          numero          TEXT    NOT NULL UNIQUE,
          date_creation   TEXT    NOT NULL,
          date_echeance   TEXT,
          libelle         TEXT    NOT NULL,
          montant_initial INTEGER NOT NULL CHECK (montant_initial >= 0),
          solde           INTEGER NOT NULL CHECK (solde >= 0),
          statut          TEXT    NOT NULL CHECK (statut IN ('ouverte', 'partielle', 'reglee', 'annulee')),
          anterieure      INTEGER NOT NULL DEFAULT 0,
          note            TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_dettes_fournisseurs_fournisseur ON dettes_fournisseurs (fournisseur_id);
        CREATE INDEX IF NOT EXISTS idx_dettes_fournisseurs_statut ON dettes_fournisseurs (statut);

        CREATE TABLE IF NOT EXISTS reglements_fournisseurs (
          id              INTEGER PRIMARY KEY,
          dette_id        INTEGER NOT NULL REFERENCES dettes_fournisseurs (id),
          date_reglement  TEXT    NOT NULL,
          montant         INTEGER NOT NULL CHECK (montant > 0),
          mode_paiement   TEXT    NOT NULL CHECK (mode_paiement IN ('especes', 'mobile', 'carte')),
          reference       TEXT,
          utilisateur_id  INTEGER REFERENCES utilisateurs (id),
          caisse_id       INTEGER REFERENCES sessions_caisse (id),
          note            TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_reglements_fournisseurs_dette ON reglements_fournisseurs (dette_id);
        CREATE INDEX IF NOT EXISTS idx_reglements_fournisseurs_caisse ON reglements_fournisseurs (caisse_id);

        CREATE TABLE IF NOT EXISTS mouvements_stock (
          id              INTEGER PRIMARY KEY,
          article_id      INTEGER NOT NULL REFERENCES articles (id),
          date_mouvement  TEXT    NOT NULL,
          type            TEXT    NOT NULL CHECK (type IN ('entree', 'sortie', 'retour', 'ajustement')),
          quantite        INTEGER NOT NULL CHECK (quantite != 0),
          stock_avant     INTEGER NOT NULL,
          stock_apres     INTEGER NOT NULL CHECK (stock_apres >= 0),
          motif           TEXT    NOT NULL,
          reference       TEXT,
          utilisateur_id  INTEGER REFERENCES utilisateurs (id),
          fournisseur_id  INTEGER REFERENCES fournisseurs (id),
          vente_id        INTEGER REFERENCES ventes (id)
        );

        CREATE INDEX IF NOT EXISTS idx_mouvements_stock_article ON mouvements_stock (article_id, date_mouvement DESC);
        CREATE INDEX IF NOT EXISTS idx_mouvements_stock_date ON mouvements_stock (date_mouvement);

        INSERT INTO mouvements_stock (article_id, date_mouvement, type, quantite, stock_avant, stock_apres, motif)
          SELECT id, strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'), 'entree', stock, 0, stock,
                 'Stock repris a la migration'
          FROM articles WHERE stock > 0;
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

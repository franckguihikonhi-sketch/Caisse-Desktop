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
  {
    version: 4,
    intitule: 'Conditionnement piece carton strict',
    appliquer(base) {
      base.exec(`
        ALTER TABLE articles ADD COLUMN pieces_par_carton INTEGER NOT NULL DEFAULT 1
          CHECK (pieces_par_carton >= 1);
        ALTER TABLE articles ADD COLUMN prix_carton INTEGER
          CHECK (prix_carton IS NULL OR prix_carton >= 0);
        ALTER TABLE articles ADD COLUMN code_barres_carton TEXT;
        ALTER TABLE articles ADD COLUMN vente_piece INTEGER NOT NULL DEFAULT 1
          CHECK (vente_piece IN (0, 1));
        ALTER TABLE articles ADD COLUMN vente_carton INTEGER NOT NULL DEFAULT 0
          CHECK (vente_carton IN (0, 1));

        CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_code_barres_carton
          ON articles (code_barres_carton) WHERE code_barres_carton IS NOT NULL;

        ALTER TABLE lignes_vente ADD COLUMN unite_vente TEXT NOT NULL DEFAULT 'piece'
          CHECK (unite_vente IN ('piece', 'carton'));
        ALTER TABLE lignes_vente ADD COLUMN facteur_stock INTEGER NOT NULL DEFAULT 1
          CHECK (facteur_stock >= 1);

        ALTER TABLE mouvements_stock ADD COLUMN unite_mouvement TEXT NOT NULL DEFAULT 'piece'
          CHECK (unite_mouvement IN ('piece', 'carton'));
        ALTER TABLE mouvements_stock ADD COLUMN facteur_stock INTEGER NOT NULL DEFAULT 1
          CHECK (facteur_stock >= 1);
        ALTER TABLE mouvements_stock ADD COLUMN quantite_unites INTEGER;

        UPDATE mouvements_stock SET quantite_unites = quantite WHERE quantite_unites IS NULL;
      `);
    },
  },
  {
    version: 5,
    intitule: 'Achats marchandises et liaison stock',
    appliquer(base) {
      base.exec(`
        CREATE TABLE IF NOT EXISTS achats (
          id                 INTEGER PRIMARY KEY,
          numero             TEXT    NOT NULL UNIQUE,
          date_achat         TEXT    NOT NULL,
          fournisseur_id     INTEGER NOT NULL REFERENCES fournisseurs (id),
          utilisateur_id     INTEGER REFERENCES utilisateurs (id),
          caisse_id          INTEGER REFERENCES sessions_caisse (id),
          dette_id           INTEGER REFERENCES dettes_fournisseurs (id),
          reference_document TEXT,
          mode_reglement     TEXT    NOT NULL CHECK (mode_reglement IN ('especes', 'mobile', 'carte', 'credit')),
          total_brut         INTEGER NOT NULL CHECK (total_brut >= 0),
          total_ht           INTEGER NOT NULL CHECK (total_ht >= 0),
          total_tva          INTEGER NOT NULL CHECK (total_tva >= 0),
          total_ttc          INTEGER NOT NULL CHECK (total_ttc >= 0),
          statut             TEXT    NOT NULL DEFAULT 'valide' CHECK (statut IN ('valide', 'annule')),
          note               TEXT,
          annule_le          TEXT,
          motif_annulation   TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_achats_date ON achats (date_achat);
        CREATE INDEX IF NOT EXISTS idx_achats_fournisseur ON achats (fournisseur_id, date_achat DESC);
        CREATE INDEX IF NOT EXISTS idx_achats_dette ON achats (dette_id);

        CREATE TABLE IF NOT EXISTS lignes_achat (
          id                  INTEGER PRIMARY KEY,
          achat_id            INTEGER NOT NULL REFERENCES achats (id) ON DELETE CASCADE,
          article_id          INTEGER NOT NULL REFERENCES articles (id),
          reference           TEXT    NOT NULL,
          designation         TEXT    NOT NULL,
          unite_achat         TEXT    NOT NULL CHECK (unite_achat IN ('piece', 'carton')),
          facteur_stock       INTEGER NOT NULL CHECK (facteur_stock >= 1),
          quantite            INTEGER NOT NULL CHECK (quantite > 0),
          quantite_stock      INTEGER NOT NULL CHECK (quantite_stock > 0),
          prix_achat_unitaire INTEGER NOT NULL CHECK (prix_achat_unitaire >= 0),
          taux_tva            REAL    NOT NULL CHECK (taux_tva >= 0),
          total_ttc           INTEGER NOT NULL CHECK (total_ttc >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_lignes_achat_achat ON lignes_achat (achat_id);
        CREATE INDEX IF NOT EXISTS idx_lignes_achat_article ON lignes_achat (article_id);

        ALTER TABLE mouvements_stock ADD COLUMN achat_id INTEGER REFERENCES achats (id);
        CREATE INDEX IF NOT EXISTS idx_mouvements_stock_achat ON mouvements_stock (achat_id);
      `);
    },
  },
  {
    version: 6,
    intitule: 'Prix achat sur fiche article',
    appliquer(base) {
      base.exec(`
        ALTER TABLE articles ADD COLUMN prix_achat_piece INTEGER
          CHECK (prix_achat_piece IS NULL OR prix_achat_piece >= 0);
        ALTER TABLE articles ADD COLUMN prix_achat_carton INTEGER
          CHECK (prix_achat_carton IS NULL OR prix_achat_carton >= 0);

        UPDATE articles
          SET prix_achat_piece = (
            SELECT lignes_achat.prix_achat_unitaire
              FROM lignes_achat
              JOIN achats ON achats.id = lignes_achat.achat_id
             WHERE lignes_achat.article_id = articles.id
               AND lignes_achat.unite_achat = 'piece'
               AND achats.statut = 'valide'
             ORDER BY achats.date_achat DESC, achats.id DESC, lignes_achat.id DESC
             LIMIT 1
          );

        UPDATE articles
          SET prix_achat_carton = (
            SELECT lignes_achat.prix_achat_unitaire
              FROM lignes_achat
              JOIN achats ON achats.id = lignes_achat.achat_id
             WHERE lignes_achat.article_id = articles.id
               AND lignes_achat.unite_achat = 'carton'
               AND achats.statut = 'valide'
             ORDER BY achats.date_achat DESC, achats.id DESC, lignes_achat.id DESC
             LIMIT 1
          );
      `);
    },
  },
  {
    version: 7,
    intitule: 'Retours articles chez fournisseur',
    appliquer(base) {
      base.exec(`
        CREATE TABLE IF NOT EXISTS retours_fournisseurs (
          id                    INTEGER PRIMARY KEY,
          numero                TEXT    NOT NULL UNIQUE,
          date_retour           TEXT    NOT NULL,
          fournisseur_id        INTEGER NOT NULL REFERENCES fournisseurs (id),
          achat_id              INTEGER NOT NULL REFERENCES achats (id),
          dette_id              INTEGER REFERENCES dettes_fournisseurs (id),
          utilisateur_id        INTEGER REFERENCES utilisateurs (id),
          reference_document    TEXT,
          total_ttc             INTEGER NOT NULL CHECK (total_ttc >= 0),
          montant_deduit_dette  INTEGER NOT NULL DEFAULT 0 CHECK (montant_deduit_dette >= 0),
          montant_avoir         INTEGER NOT NULL DEFAULT 0 CHECK (montant_avoir >= 0),
          statut                TEXT    NOT NULL DEFAULT 'valide' CHECK (statut IN ('valide', 'annule')),
          note                  TEXT,
          annule_le             TEXT,
          motif_annulation      TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_retours_fournisseurs_date ON retours_fournisseurs (date_retour);
        CREATE INDEX IF NOT EXISTS idx_retours_fournisseurs_achat ON retours_fournisseurs (achat_id);
        CREATE INDEX IF NOT EXISTS idx_retours_fournisseurs_fournisseur ON retours_fournisseurs (fournisseur_id, date_retour DESC);
        CREATE INDEX IF NOT EXISTS idx_retours_fournisseurs_dette ON retours_fournisseurs (dette_id);

        CREATE TABLE IF NOT EXISTS lignes_retour_fournisseur (
          id                  INTEGER PRIMARY KEY,
          retour_id           INTEGER NOT NULL REFERENCES retours_fournisseurs (id) ON DELETE CASCADE,
          ligne_achat_id      INTEGER NOT NULL REFERENCES lignes_achat (id),
          article_id          INTEGER NOT NULL REFERENCES articles (id),
          reference           TEXT    NOT NULL,
          designation         TEXT    NOT NULL,
          unite_retour        TEXT    NOT NULL CHECK (unite_retour IN ('piece', 'carton')),
          facteur_stock       INTEGER NOT NULL CHECK (facteur_stock >= 1),
          quantite            INTEGER NOT NULL CHECK (quantite > 0),
          quantite_stock      INTEGER NOT NULL CHECK (quantite_stock > 0),
          prix_achat_unitaire INTEGER NOT NULL CHECK (prix_achat_unitaire >= 0),
          total_ttc           INTEGER NOT NULL CHECK (total_ttc >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_lignes_retour_retour ON lignes_retour_fournisseur (retour_id);
        CREATE INDEX IF NOT EXISTS idx_lignes_retour_ligne_achat ON lignes_retour_fournisseur (ligne_achat_id);
        CREATE INDEX IF NOT EXISTS idx_lignes_retour_article ON lignes_retour_fournisseur (article_id);

        ALTER TABLE mouvements_stock ADD COLUMN retour_fournisseur_id INTEGER REFERENCES retours_fournisseurs (id);
        CREATE INDEX IF NOT EXISTS idx_mouvements_stock_retour_fournisseur
          ON mouvements_stock (retour_fournisseur_id);
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

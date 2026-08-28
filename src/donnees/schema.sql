-- Forme d'origine des tables : c'est l'etape 1 des migrations, et elle ne
-- bouge plus. Les changements de schema qui ont suivi sont dans migrations.js,
-- si bien que le schema courant se lit ici PUIS la-bas.
--
-- Tous les montants sont des entiers, en francs CFA : la monnaie n'a pas de
-- subdivision, et un entier ne derive pas comme un flottant.

CREATE TABLE IF NOT EXISTS utilisateurs (
  id            INTEGER PRIMARY KEY,
  identifiant   TEXT    NOT NULL UNIQUE,
  nom           TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('administrateur', 'caissier')),
  empreinte     TEXT    NOT NULL,
  sel           TEXT    NOT NULL,
  actif         INTEGER NOT NULL DEFAULT 1,
  cree_le       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY,
  reference     TEXT    NOT NULL UNIQUE,
  designation   TEXT    NOT NULL,
  prix_unitaire INTEGER NOT NULL CHECK (prix_unitaire >= 0),
  taux_tva      REAL    NOT NULL DEFAULT 18 CHECK (taux_tva >= 0),
  stock         INTEGER NOT NULL DEFAULT 0,
  seuil_alerte  INTEGER NOT NULL DEFAULT 0,
  actif         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_articles_designation ON articles (designation);

CREATE TABLE IF NOT EXISTS ventes (
  id             INTEGER PRIMARY KEY,
  numero         TEXT    NOT NULL UNIQUE,
  date_vente     TEXT    NOT NULL,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs (id),
  total_brut     INTEGER NOT NULL,
  remise         INTEGER NOT NULL DEFAULT 0,
  total_ttc      INTEGER NOT NULL,
  total_ht       INTEGER NOT NULL,
  total_tva      INTEGER NOT NULL,
  mode_paiement  TEXT    NOT NULL CHECK (mode_paiement IN ('especes', 'mobile', 'carte')),
  montant_recu   INTEGER,
  monnaie_rendue INTEGER,
  annulee        INTEGER NOT NULL DEFAULT 0,
  annulee_le     TEXT,
  motif_annulation TEXT
);

CREATE INDEX IF NOT EXISTS idx_ventes_date ON ventes (date_vente);

CREATE TABLE IF NOT EXISTS lignes_vente (
  id             INTEGER PRIMARY KEY,
  vente_id       INTEGER NOT NULL REFERENCES ventes (id) ON DELETE CASCADE,
  article_id     INTEGER REFERENCES articles (id),
  reference      TEXT    NOT NULL,
  designation    TEXT    NOT NULL,
  prix_unitaire  INTEGER NOT NULL,
  quantite       INTEGER NOT NULL CHECK (quantite > 0),
  taux_tva       REAL    NOT NULL,
  remise_pourcent REAL   NOT NULL DEFAULT 0,
  total_ttc      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lignes_vente ON lignes_vente (vente_id);

CREATE TABLE IF NOT EXISTS parametres (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

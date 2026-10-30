'use strict';

const { horodater, jourDe } = require('../metier/horodatage');
const { formater } = require('../metier/monnaie');
const caisse = require('./caisse');

const MODES_REGLEMENT = ['especes', 'mobile', 'carte'];

function normaliserTexte(valeur) {
  const texte = String(valeur ?? '').trim();
  return texte === '' ? null : texte;
}

function entierMontant(nom, valeur) {
  const montant = Number(valeur);
  if (!Number.isInteger(montant) || montant <= 0) {
    throw new RangeError(nom + ' doit etre un montant entier positif.');
  }
  return montant;
}

function codeDepuisNom(base, nom) {
  const racine = String(nom)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'FOURN';
  let code = racine;
  let i = 1;
  const existe = base.prepare('SELECT 1 FROM fournisseurs WHERE code = ?');
  while (existe.get(code)) {
    i += 1;
    code = racine + '-' + String(i).padStart(2, '0');
  }
  return code;
}

function normaliserFournisseur(base, donnees, courant = null) {
  const nom = normaliserTexte(donnees.nom);
  if (!nom) throw new RangeError('Le nom du fournisseur est obligatoire.');
  let code = normaliserTexte(donnees.code);
  code = code ? code.toUpperCase() : (courant?.code ?? codeDepuisNom(base, nom));
  return {
    code,
    nom,
    telephone: normaliserTexte(donnees.telephone),
    adresse: normaliserTexte(donnees.adresse),
    email: normaliserTexte(donnees.email),
  };
}

function enFournisseur(l) {
  return l && {
    id: l.id,
    code: l.code,
    nom: l.nom,
    telephone: l.telephone,
    adresse: l.adresse,
    email: l.email,
    actif: Boolean(l.actif),
    creeLe: l.cree_le,
    solde: l.solde ?? 0,
  };
}

function traduireCollision(erreur, fournisseur) {
  if (String(erreur.message).includes('UNIQUE')) {
    return new RangeError('Le code fournisseur ' + fournisseur.code + ' existe deja.');
  }
  return erreur;
}

function creer(base, donnees) {
  const f = normaliserFournisseur(base, donnees);
  try {
    const r = base.prepare(
      'INSERT INTO fournisseurs (code, nom, telephone, adresse, email, cree_le) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(f.code, f.nom, f.telephone, f.adresse, f.email, horodater());
    return lire(base, r.lastInsertRowid);
  } catch (erreur) {
    throw traduireCollision(erreur, f);
  }
}

function modifier(base, id, donnees) {
  const courant = base.prepare('SELECT * FROM fournisseurs WHERE id = ?').get(id);
  if (!courant) throw new RangeError('Fournisseur introuvable.');
  const f = normaliserFournisseur(base, donnees, courant);
  try {
    base.prepare('UPDATE fournisseurs SET code = ?, nom = ?, telephone = ?, adresse = ?, email = ? WHERE id = ?')
      .run(f.code, f.nom, f.telephone, f.adresse, f.email, id);
    return lire(base, id);
  } catch (erreur) {
    throw traduireCollision(erreur, f);
  }
}

function retirer(base, id) {
  base.prepare('UPDATE fournisseurs SET actif = 0 WHERE id = ?').run(id);
}

function lire(base, id) {
  return enFournisseur(base.prepare(
    'SELECT fournisseurs.*, COALESCE(SUM(CASE WHEN dettes_fournisseurs.statut IN (\'ouverte\', \'partielle\') ' +
      'THEN dettes_fournisseurs.solde ELSE 0 END), 0) AS solde FROM fournisseurs ' +
      'LEFT JOIN dettes_fournisseurs ON dettes_fournisseurs.fournisseur_id = fournisseurs.id ' +
      'WHERE fournisseurs.id = ? GROUP BY fournisseurs.id'
  ).get(id));
}

function lister(base, { inclureInactifs = false, recherche = '' } = {}) {
  const filtreActif = inclureInactifs ? '' : ' AND fournisseurs.actif = 1';
  const motif = '%' + String(recherche ?? '').trim() + '%';
  return base.prepare(
    'SELECT fournisseurs.*, COALESCE(SUM(CASE WHEN dettes_fournisseurs.statut IN (\'ouverte\', \'partielle\') ' +
      'THEN dettes_fournisseurs.solde ELSE 0 END), 0) AS solde FROM fournisseurs ' +
      'LEFT JOIN dettes_fournisseurs ON dettes_fournisseurs.fournisseur_id = fournisseurs.id ' +
      'WHERE (fournisseurs.code LIKE ? OR fournisseurs.nom LIKE ? OR fournisseurs.telephone LIKE ?)' + filtreActif + ' ' +
      'GROUP BY fournisseurs.id ORDER BY fournisseurs.nom'
  ).all(motif, motif, motif).map(enFournisseur);
}

function numeroDetteSuivant(base, date) {
  const j = jourDe(date).replace(/-/g, '');
  const derniere = base.prepare(
    "SELECT numero FROM dettes_fournisseurs WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1"
  ).get('DF-' + j + '-%');
  const rang = derniere ? Number(derniere.numero.split('-')[2]) + 1 : 1;
  return 'DF-' + j + '-' + String(rang).padStart(4, '0');
}

function creerDette(base, donnees) {
  return base.transaction(() => {
    const fournisseur = lire(base, donnees.fournisseurId);
    if (!fournisseur || !fournisseur.actif) throw new RangeError('Fournisseur introuvable ou desactive.');
    const montant = entierMontant('Le montant de la dette fournisseur', donnees.montantInitial ?? donnees.montant);
    const date = donnees.dateCreation || horodater();
    const numero = donnees.numero || numeroDetteSuivant(base, date);
    const libelle = normaliserTexte(donnees.libelle) || 'Dette fournisseur';
    const r = base.prepare(
      'INSERT INTO dettes_fournisseurs (fournisseur_id, numero, date_creation, date_echeance, libelle, ' +
        'montant_initial, solde, statut, anterieure, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      fournisseur.id,
      numero,
      date,
      normaliserTexte(donnees.dateEcheance),
      libelle,
      montant,
      montant,
      'ouverte',
      donnees.anterieure ? 1 : 0,
      normaliserTexte(donnees.note)
    );
    return lireDette(base, r.lastInsertRowid);
  })();
}

function creerDetteAnterieure(base, donnees) {
  return creerDette(base, { ...donnees, anterieure: true, libelle: donnees.libelle || 'Dette fournisseur anterieure' });
}

function enDette(l) {
  return l && {
    id: l.id,
    fournisseurId: l.fournisseur_id,
    fournisseurNom: l.fournisseur_nom,
    fournisseurCode: l.fournisseur_code,
    numero: l.numero,
    dateCreation: l.date_creation,
    dateEcheance: l.date_echeance,
    libelle: l.libelle,
    montantInitial: l.montant_initial,
    solde: l.solde,
    statut: l.statut,
    anterieure: Boolean(l.anterieure),
    note: l.note,
  };
}

function lireDette(base, id) {
  return enDette(base.prepare(
    'SELECT dettes_fournisseurs.*, fournisseurs.nom AS fournisseur_nom, fournisseurs.code AS fournisseur_code ' +
      'FROM dettes_fournisseurs JOIN fournisseurs ON fournisseurs.id = dettes_fournisseurs.fournisseur_id ' +
      'WHERE dettes_fournisseurs.id = ?'
  ).get(id));
}

function listerDettes(base, { fournisseurId = null, inclureReglees = false } = {}) {
  const conditions = [];
  const params = [];
  if (fournisseurId) {
    conditions.push('dettes_fournisseurs.fournisseur_id = ?');
    params.push(fournisseurId);
  }
  if (!inclureReglees) conditions.push("dettes_fournisseurs.statut IN ('ouverte', 'partielle')");
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' ' : '';
  return base.prepare(
    'SELECT dettes_fournisseurs.*, fournisseurs.nom AS fournisseur_nom, fournisseurs.code AS fournisseur_code ' +
      'FROM dettes_fournisseurs JOIN fournisseurs ON fournisseurs.id = dettes_fournisseurs.fournisseur_id ' +
      where + 'ORDER BY dettes_fournisseurs.statut = \'reglee\', dettes_fournisseurs.date_creation DESC, dettes_fournisseurs.id DESC'
  ).all(...params).map(enDette);
}

function enregistrerReglement(base, donnees) {
  return base.transaction(() => {
    const dette = lireDette(base, donnees.detteId);
    if (!dette) throw new RangeError('Dette fournisseur introuvable.');
    if (dette.statut === 'reglee' || dette.solde <= 0) throw new RangeError('Cette dette est deja reglee.');
    const montant = entierMontant('Le montant du reglement', donnees.montant);
    if (montant > dette.solde) {
      throw new RangeError('Le reglement depasse le solde restant (' + formater(dette.solde) + ').');
    }
    const mode = String(donnees.modePaiement ?? '').trim();
    if (!MODES_REGLEMENT.includes(mode)) throw new RangeError('Mode de reglement inconnu.');

    const session = caisse.exigerOuverte(base);
    const nouveauSolde = dette.solde - montant;
    const statut = nouveauSolde === 0 ? 'reglee' : 'partielle';
    const r = base.prepare(
      'INSERT INTO reglements_fournisseurs (dette_id, date_reglement, montant, mode_paiement, reference, ' +
        'utilisateur_id, caisse_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      dette.id,
      donnees.dateReglement || horodater(),
      montant,
      mode,
      normaliserTexte(donnees.reference),
      donnees.utilisateurId ?? null,
      session?.id ?? null,
      normaliserTexte(donnees.note)
    );

    base.prepare('UPDATE dettes_fournisseurs SET solde = ?, statut = ? WHERE id = ?')
      .run(nouveauSolde, statut, dette.id);
    return { reglementId: r.lastInsertRowid, dette: lireDette(base, dette.id) };
  })();
}

function listerReglements(base, detteId) {
  return base.prepare(
    'SELECT reglements_fournisseurs.*, utilisateurs.nom AS utilisateur FROM reglements_fournisseurs ' +
      'LEFT JOIN utilisateurs ON utilisateurs.id = reglements_fournisseurs.utilisateur_id ' +
      'WHERE dette_id = ? ORDER BY id DESC'
  ).all(detteId).map((r) => ({
    id: r.id,
    detteId: r.dette_id,
    date: r.date_reglement,
    montant: r.montant,
    modePaiement: r.mode_paiement,
    reference: r.reference,
    utilisateur: r.utilisateur,
    note: r.note,
  }));
}

function synthese(base) {
  return base.prepare(
    "SELECT COUNT(*) AS nombre, COALESCE(SUM(solde), 0) AS solde FROM dettes_fournisseurs " +
      "WHERE statut IN ('ouverte', 'partielle')"
  ).get();
}

module.exports = {
  creer,
  modifier,
  retirer,
  lire,
  lister,
  creerDette,
  creerDetteAnterieure,
  lireDette,
  listerDettes,
  listerReglements,
  enregistrerReglement,
  synthese,
};

'use strict';

const { horodater, jourDe } = require('../metier/horodatage');
const { formater } = require('../metier/monnaie');
const caisse = require('./caisse');

const MODES_REGLEMENT = ['especes', 'mobile', 'carte'];

function normaliserTexte(valeur) {
  const texte = String(valeur ?? '').trim();
  return texte === '' ? null : texte;
}

function entierMontant(nom, valeur, { zeroAutorise = false } = {}) {
  const montant = Number(valeur);
  if (!Number.isInteger(montant) || montant < 0 || (!zeroAutorise && montant === 0)) {
    throw new RangeError(nom + ' doit etre un montant entier positif' + (zeroAutorise ? ' ou nul.' : '.'));
  }
  return montant;
}

function codeDepuisNom(base, nom) {
  const racine = String(nom)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'CLIENT';
  let code = racine;
  let i = 1;
  const existe = base.prepare('SELECT 1 FROM clients WHERE code = ?');
  while (existe.get(code)) {
    i += 1;
    code = racine + '-' + String(i).padStart(2, '0');
  }
  return code;
}

function normaliserClient(base, donnees, client = null) {
  const nom = normaliserTexte(donnees.nom);
  if (!nom) throw new RangeError('Le nom du client est obligatoire.');
  let code = normaliserTexte(donnees.code);
  code = code ? code.toUpperCase() : (client?.code ?? codeDepuisNom(base, nom));
  const plafondCredit = entierMontant('Le plafond credit', donnees.plafondCredit ?? client?.plafond_credit ?? 0, { zeroAutorise: true });
  return {
    code,
    nom,
    telephone: normaliserTexte(donnees.telephone),
    adresse: normaliserTexte(donnees.adresse),
    email: normaliserTexte(donnees.email),
    plafondCredit,
  };
}

function enClient(l) {
  return l && {
    id: l.id,
    code: l.code,
    nom: l.nom,
    telephone: l.telephone,
    adresse: l.adresse,
    email: l.email,
    plafondCredit: l.plafond_credit,
    actif: Boolean(l.actif),
    creeLe: l.cree_le,
    solde: l.solde ?? 0,
  };
}

function traduireCollision(erreur, client) {
  if (String(erreur.message).includes('UNIQUE')) {
    return new RangeError('Le code client ' + client.code + ' existe deja.');
  }
  return erreur;
}

function creer(base, donnees) {
  const c = normaliserClient(base, donnees);
  try {
    const r = base.prepare(
      'INSERT INTO clients (code, nom, telephone, adresse, email, plafond_credit, cree_le) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(c.code, c.nom, c.telephone, c.adresse, c.email, c.plafondCredit, horodater());
    return lire(base, r.lastInsertRowid);
  } catch (erreur) {
    throw traduireCollision(erreur, c);
  }
}

function modifier(base, id, donnees) {
  const courant = base.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!courant) throw new RangeError('Client introuvable.');
  const c = normaliserClient(base, donnees, courant);
  try {
    base.prepare(
      'UPDATE clients SET code = ?, nom = ?, telephone = ?, adresse = ?, email = ?, plafond_credit = ? ' +
        'WHERE id = ?'
    ).run(c.code, c.nom, c.telephone, c.adresse, c.email, c.plafondCredit, id);
    return lire(base, id);
  } catch (erreur) {
    throw traduireCollision(erreur, c);
  }
}

function retirer(base, id) {
  base.prepare('UPDATE clients SET actif = 0 WHERE id = ?').run(id);
}

function lire(base, id) {
  return enClient(base.prepare(
    'SELECT clients.*, COALESCE(SUM(CASE WHEN creances_clients.statut IN (\'ouverte\', \'partielle\') ' +
      'THEN creances_clients.solde ELSE 0 END), 0) AS solde FROM clients ' +
      'LEFT JOIN creances_clients ON creances_clients.client_id = clients.id ' +
      'WHERE clients.id = ? GROUP BY clients.id'
  ).get(id));
}

function lister(base, { inclureInactifs = false, recherche = '' } = {}) {
  const filtreActif = inclureInactifs ? '' : ' AND clients.actif = 1';
  const motif = '%' + String(recherche ?? '').trim() + '%';
  return base.prepare(
    'SELECT clients.*, COALESCE(SUM(CASE WHEN creances_clients.statut IN (\'ouverte\', \'partielle\') ' +
      'THEN creances_clients.solde ELSE 0 END), 0) AS solde FROM clients ' +
      'LEFT JOIN creances_clients ON creances_clients.client_id = clients.id ' +
      'WHERE (clients.code LIKE ? OR clients.nom LIKE ? OR clients.telephone LIKE ?)' + filtreActif + ' ' +
      'GROUP BY clients.id ORDER BY clients.nom'
  ).all(motif, motif, motif).map(enClient);
}

function numeroCreanceSuivant(base, date) {
  const jour = jourDe(date).replace(/-/g, '');
  const derniere = base.prepare(
    "SELECT numero FROM creances_clients WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1"
  ).get('CR-' + jour + '-%');
  const rang = derniere ? Number(derniere.numero.split('-')[2]) + 1 : 1;
  return 'CR-' + jour + '-' + String(rang).padStart(4, '0');
}

function soldeClient(base, clientId) {
  return base.prepare(
    "SELECT COALESCE(SUM(solde), 0) AS solde FROM creances_clients " +
      "WHERE client_id = ? AND statut IN ('ouverte', 'partielle')"
  ).get(clientId).solde;
}

function verifierCreditPossible(base, clientId, montant) {
  const client = lire(base, clientId);
  if (!client || !client.actif) throw new RangeError('Client introuvable ou desactive.');
  const detteApres = soldeClient(base, clientId) + montant;
  if (client.plafondCredit > 0 && detteApres > client.plafondCredit) {
    throw new RangeError(
      'Plafond credit depasse pour ' + client.nom +
        ' : plafond ' + formater(client.plafondCredit) + ', solde apres vente ' + formater(detteApres) + '.'
    );
  }
  return client;
}

function creerCreance(base, donnees) {
  return base.transaction(() => {
    const clientId = Number(donnees.clientId);
    const montant = entierMontant('Le montant de la creance', donnees.montantInitial ?? donnees.montant);
    const client = donnees.ignorerPlafond
      ? lire(base, clientId)
      : verifierCreditPossible(base, clientId, montant);
    if (!client || !client.actif) throw new RangeError('Client introuvable ou desactive.');
    const date = donnees.dateCreation || horodater();
    const numero = donnees.numero || numeroCreanceSuivant(base, date);
    const libelle = normaliserTexte(donnees.libelle) || 'Creance client';
    const echeance = normaliserTexte(donnees.dateEcheance);
    const note = normaliserTexte(donnees.note);

    const r = base.prepare(
      'INSERT INTO creances_clients (client_id, vente_id, numero, date_creation, date_echeance, libelle, ' +
        'montant_initial, solde, statut, anterieure, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      client.id,
      donnees.venteId ?? null,
      numero,
      date,
      echeance,
      libelle,
      montant,
      montant,
      montant === 0 ? 'reglee' : 'ouverte',
      donnees.anterieure ? 1 : 0,
      note
    );
    return lireCreance(base, r.lastInsertRowid);
  })();
}

function creerCreanceAnterieure(base, donnees) {
  return creerCreance(base, {
    ...donnees,
    anterieure: true,
    ignorerPlafond: true,
    libelle: donnees.libelle || 'Creance anterieure',
  });
}

function creerCreanceVente(base, { clientId, venteId, numeroVente, montant, dateCreation }) {
  return creerCreance(base, {
    clientId,
    venteId,
    montantInitial: montant,
    dateCreation,
    libelle: 'Vente a credit ' + numeroVente,
    anterieure: false,
  });
}

function enCreance(l) {
  return l && {
    id: l.id,
    clientId: l.client_id,
    clientNom: l.client_nom,
    clientCode: l.client_code,
    venteId: l.vente_id,
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

function lireCreance(base, id) {
  return enCreance(base.prepare(
    'SELECT creances_clients.*, clients.nom AS client_nom, clients.code AS client_code FROM creances_clients ' +
      'JOIN clients ON clients.id = creances_clients.client_id WHERE creances_clients.id = ?'
  ).get(id));
}

function listerCreances(base, { clientId = null, inclureReglees = false } = {}) {
  const conditions = [];
  const params = [];
  if (clientId) {
    conditions.push('creances_clients.client_id = ?');
    params.push(clientId);
  }
  if (!inclureReglees) conditions.push("creances_clients.statut IN ('ouverte', 'partielle')");
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' ' : '';
  return base.prepare(
    'SELECT creances_clients.*, clients.nom AS client_nom, clients.code AS client_code FROM creances_clients ' +
      'JOIN clients ON clients.id = creances_clients.client_id ' + where +
      'ORDER BY creances_clients.statut = \'reglee\', creances_clients.date_creation DESC, creances_clients.id DESC'
  ).all(...params).map(enCreance);
}

function enregistrerReglement(base, donnees) {
  return base.transaction(() => {
    const creance = lireCreance(base, donnees.creanceId);
    if (!creance) throw new RangeError('Creance introuvable.');
    if (creance.statut === 'reglee' || creance.solde <= 0) throw new RangeError('Cette creance est deja reglee.');
    const montant = entierMontant('Le montant du reglement', donnees.montant);
    if (montant > creance.solde) {
      throw new RangeError('Le reglement depasse le solde restant (' + formater(creance.solde) + ').');
    }
    const mode = String(donnees.modePaiement ?? '').trim();
    if (!MODES_REGLEMENT.includes(mode)) throw new RangeError('Mode de reglement inconnu.');

    const session = caisse.exigerOuverte(base);
    const date = donnees.dateReglement || horodater();
    const nouveauSolde = creance.solde - montant;
    const statut = nouveauSolde === 0 ? 'reglee' : 'partielle';

    const r = base.prepare(
      'INSERT INTO reglements_clients (creance_id, date_reglement, montant, mode_paiement, reference, ' +
        'utilisateur_id, caisse_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      creance.id,
      date,
      montant,
      mode,
      normaliserTexte(donnees.reference),
      donnees.utilisateurId ?? null,
      session?.id ?? null,
      normaliserTexte(donnees.note)
    );

    base.prepare('UPDATE creances_clients SET solde = ?, statut = ? WHERE id = ?')
      .run(nouveauSolde, statut, creance.id);

    return { reglementId: r.lastInsertRowid, creance: lireCreance(base, creance.id) };
  })();
}

function listerReglements(base, creanceId) {
  return base.prepare(
    'SELECT reglements_clients.*, utilisateurs.nom AS utilisateur FROM reglements_clients ' +
      'LEFT JOIN utilisateurs ON utilisateurs.id = reglements_clients.utilisateur_id ' +
      'WHERE creance_id = ? ORDER BY id DESC'
  ).all(creanceId).map((r) => ({
    id: r.id,
    creanceId: r.creance_id,
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
    "SELECT COUNT(*) AS nombre, COALESCE(SUM(solde), 0) AS solde FROM creances_clients " +
      "WHERE statut IN ('ouverte', 'partielle')"
  ).get();
}

module.exports = {
  creer,
  modifier,
  retirer,
  lire,
  lister,
  creerCreance,
  creerCreanceAnterieure,
  creerCreanceVente,
  lireCreance,
  listerCreances,
  listerReglements,
  enregistrerReglement,
  soldeClient,
  verifierCreditPossible,
  synthese,
};

'use strict';

const { horodater, jour } = require('../metier/horodatage');

function montant(nom, valeur) {
  const m = Number(valeur ?? 0);
  if (!Number.isInteger(m) || m < 0) throw new RangeError(nom + ' doit etre un entier positif ou nul.');
  return m;
}

function enSession(l) {
  return l && {
    id: l.id,
    statut: l.statut,
    ouverteLe: l.ouverte_le,
    ouvertParId: l.ouvert_par_id,
    ouvertPar: l.ouvert_par,
    fondOuverture: l.fond_ouverture,
    noteOuverture: l.note_ouverture,
    fermeeLe: l.fermee_le,
    fermeeParId: l.fermee_par_id,
    fermeePar: l.fermee_par,
    fondFermeture: l.fond_fermeture,
    totalTheorique: l.total_theorique,
    ecart: l.ecart,
    noteFermeture: l.note_fermeture,
  };
}

function ouverte(base) {
  return enSession(base.prepare(
    'SELECT sessions_caisse.*, ouvreur.nom AS ouvert_par, fermeur.nom AS fermee_par FROM sessions_caisse ' +
      'JOIN utilisateurs AS ouvreur ON ouvreur.id = sessions_caisse.ouvert_par_id ' +
      'LEFT JOIN utilisateurs AS fermeur ON fermeur.id = sessions_caisse.fermee_par_id ' +
      "WHERE sessions_caisse.statut = 'ouverte' LIMIT 1"
  ).get());
}

function exigerOuverte(base) {
  const session = ouverte(base);
  if (!session) throw new RangeError("La caisse n'est pas ouverte. Ouvrez la caisse avant d'encaisser.");
  return session;
}

function ouvrir(base, { fondOuverture = 0, note = '', utilisateurId }) {
  return base.transaction(() => {
    if (ouverte(base)) throw new RangeError('Une caisse est deja ouverte. Fermez-la avant une nouvelle ouverture.');
    const fond = montant("Le fond d'ouverture", fondOuverture);
    const r = base.prepare(
      'INSERT INTO sessions_caisse (statut, ouverte_le, ouvert_par_id, fond_ouverture, note_ouverture) ' +
        "VALUES ('ouverte', ?, ?, ?, ?)"
    ).run(horodater(), utilisateurId, fond, String(note ?? '').trim() || null);
    return etat(base, r.lastInsertRowid).session;
  })();
}

function fermer(base, { fondFermeture = 0, note = '', utilisateurId }) {
  return base.transaction(() => {
    const session = exigerOuverte(base);
    const resume = resumeSession(base, session.id);
    const fond = montant('Le fond compte a la fermeture', fondFermeture);
    const ecart = fond - resume.totalTheorique;
    base.prepare(
      "UPDATE sessions_caisse SET statut = 'fermee', fermee_le = ?, fermee_par_id = ?, " +
        'fond_fermeture = ?, total_theorique = ?, ecart = ?, note_fermeture = ? WHERE id = ?'
    ).run(horodater(), utilisateurId, fond, resume.totalTheorique, ecart, String(note ?? '').trim() || null, session.id);
    return etat(base, session.id).session;
  })();
}

function ventesParMode(base, sessionId) {
  return base.prepare(
    'SELECT CASE WHEN paiement_credit = 1 THEN \'credit\' ELSE mode_paiement END AS mode, ' +
      'COUNT(*) AS nombre, COALESCE(SUM(total_ttc), 0) AS total FROM ventes ' +
      'WHERE caisse_id = ? AND annulee = 0 GROUP BY mode'
  ).all(sessionId);
}

function reglementsClientsParMode(base, sessionId) {
  return base.prepare(
    'SELECT mode_paiement AS mode, COUNT(*) AS nombre, COALESCE(SUM(montant), 0) AS total FROM reglements_clients ' +
      'WHERE caisse_id = ? GROUP BY mode_paiement'
  ).all(sessionId);
}

function reglementsFournisseursParMode(base, sessionId) {
  return base.prepare(
    'SELECT mode_paiement AS mode, COUNT(*) AS nombre, COALESCE(SUM(montant), 0) AS total FROM reglements_fournisseurs ' +
      'WHERE caisse_id = ? GROUP BY mode_paiement'
  ).all(sessionId);
}

function sommeMode(lignes, mode) {
  return lignes.find((l) => l.mode === mode)?.total ?? 0;
}

function resumeSession(base, sessionId) {
  const session = lire(base, sessionId);
  if (!session) throw new RangeError('Session de caisse introuvable.');
  const ventes = ventesParMode(base, sessionId);
  const reglementsClients = reglementsClientsParMode(base, sessionId);
  const reglementsFournisseurs = reglementsFournisseursParMode(base, sessionId);

  const totalVentes = ventes.reduce((s, l) => s + l.total, 0);
  const ventesCredit = sommeMode(ventes, 'credit');
  const ventesEncaissees = totalVentes - ventesCredit;
  const entreesCreances = reglementsClients.reduce((s, l) => s + l.total, 0);
  const sortiesFournisseurs = reglementsFournisseurs.reduce((s, l) => s + l.total, 0);
  const especesVentes = sommeMode(ventes, 'especes');
  const especesClients = sommeMode(reglementsClients, 'especes');
  const especesFournisseurs = sommeMode(reglementsFournisseurs, 'especes');
  const totalTheorique = session.fondOuverture + especesVentes + especesClients - especesFournisseurs;

  return {
    session,
    ventes,
    reglementsClients,
    reglementsFournisseurs,
    totalVentes,
    ventesEncaissees,
    ventesCredit,
    entreesCreances,
    sortiesFournisseurs,
    totalTheorique,
  };
}

function lire(base, id) {
  return enSession(base.prepare(
    'SELECT sessions_caisse.*, ouvreur.nom AS ouvert_par, fermeur.nom AS fermee_par FROM sessions_caisse ' +
      'JOIN utilisateurs AS ouvreur ON ouvreur.id = sessions_caisse.ouvert_par_id ' +
      'LEFT JOIN utilisateurs AS fermeur ON fermeur.id = sessions_caisse.fermee_par_id ' +
      'WHERE sessions_caisse.id = ?'
  ).get(id));
}

function lister(base, { limite = 30 } = {}) {
  const borne = Math.max(1, Math.min(100, Number(limite) || 30));
  return base.prepare(
    'SELECT sessions_caisse.*, ouvreur.nom AS ouvert_par, fermeur.nom AS fermee_par FROM sessions_caisse ' +
      'JOIN utilisateurs AS ouvreur ON ouvreur.id = sessions_caisse.ouvert_par_id ' +
      'LEFT JOIN utilisateurs AS fermeur ON fermeur.id = sessions_caisse.fermee_par_id ' +
      'ORDER BY sessions_caisse.id DESC LIMIT ?'
  ).all(borne).map(enSession);
}

function etat(base, sessionId = null) {
  const session = sessionId ? lire(base, sessionId) : ouverte(base);
  return {
    ouverte: Boolean(session && session.statut === 'ouverte'),
    session,
    resume: session ? resumeSession(base, session.id) : null,
    jour: jour(),
  };
}

module.exports = { ouvrir, fermer, ouverte, exigerOuverte, lire, lister, resumeSession, etat };

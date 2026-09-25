'use strict';

const { horodater } = require('../metier/horodatage');

function chaine(valeur, max = 600) {
  const texte = String(valeur ?? '').trim();
  return texte.length > max ? texte.slice(0, max - 1) + '…' : texte;
}

function json(details) {
  if (details === undefined || details === null) return null;
  try {
    return JSON.stringify(details);
  } catch (_erreur) {
    return JSON.stringify({ note: 'Details non serialisables.' });
  }
}

function enregistrer(base, {
  utilisateur = null,
  action,
  entite,
  entiteId = null,
  resume = '',
  details = null,
  date = horodater(),
} = {}) {
  const a = chaine(action, 80);
  const e = chaine(entite, 80);
  if (!a) throw new RangeError("L'action d'audit est obligatoire.");
  if (!e) throw new RangeError("L'entite d'audit est obligatoire.");
  const r = base.prepare(
    'INSERT INTO journal_audit (date_action, utilisateur_id, utilisateur_nom, utilisateur_role, action, entite, entite_id, resume, details_json) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    date,
    utilisateur?.id ?? null,
    chaine(utilisateur?.nom ?? utilisateur?.identifiant ?? 'Systeme', 120),
    chaine(utilisateur?.role ?? '', 60) || null,
    a,
    e,
    entiteId === undefined ? null : entiteId,
    chaine(resume, 600),
    json(details)
  );
  return lire(base, r.lastInsertRowid);
}

function enLigne(l) {
  if (!l) return null;
  let details = null;
  if (l.details_json) {
    try { details = JSON.parse(l.details_json); }
    catch (_erreur) { details = { brut: l.details_json }; }
  }
  return {
    id: l.id,
    date: l.date_action,
    utilisateurId: l.utilisateur_id,
    utilisateurNom: l.utilisateur_nom,
    utilisateurRole: l.utilisateur_role,
    action: l.action,
    entite: l.entite,
    entiteId: l.entite_id,
    resume: l.resume,
    details,
  };
}

function lire(base, id) {
  return enLigne(base.prepare('SELECT * FROM journal_audit WHERE id = ?').get(id));
}

function lister(base, { limite = 200, action = '', entite = '', utilisateurId = null, recherche = '' } = {}) {
  const conditions = [];
  const params = [];
  if (action) {
    conditions.push('journal_audit.action = ?');
    params.push(String(action));
  }
  if (entite) {
    conditions.push('journal_audit.entite = ?');
    params.push(String(entite));
  }
  if (utilisateurId) {
    conditions.push('journal_audit.utilisateur_id = ?');
    params.push(utilisateurId);
  }
  const q = String(recherche ?? '').trim();
  if (q) {
    conditions.push('(journal_audit.resume LIKE ? OR journal_audit.action LIKE ? OR journal_audit.entite LIKE ? OR journal_audit.utilisateur_nom LIKE ?)');
    const motif = '%' + q + '%';
    params.push(motif, motif, motif, motif);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' ' : '';
  const borne = Math.max(1, Math.min(1000, Number(limite) || 200));
  return base.prepare(
    'SELECT * FROM journal_audit ' + where + 'ORDER BY id DESC LIMIT ?'
  ).all(...params, borne).map(enLigne);
}

function resume(base) {
  const total = base.prepare('SELECT COUNT(*) AS n FROM journal_audit').get().n;
  const dernier = enLigne(base.prepare('SELECT * FROM journal_audit ORDER BY id DESC LIMIT 1').get());
  const parAction = base.prepare(
    'SELECT action, COUNT(*) AS nombre FROM journal_audit GROUP BY action ORDER BY nombre DESC, action LIMIT 10'
  ).all();
  return { total, dernier, parAction };
}

module.exports = { enregistrer, lire, lister, resume };

'use strict';

function normaliser(article) {
  const reference = String(article.reference ?? '').trim().toUpperCase();
  const designation = String(article.designation ?? '').trim();
  if (!reference) throw new RangeError('La reference est obligatoire.');
  if (!designation) throw new RangeError('La designation est obligatoire.');

  const prix = Number(article.prixUnitaire);
  if (!Number.isInteger(prix) || prix < 0) {
    throw new RangeError('Le prix doit etre un entier de francs, positif ou nul.');
  }
  const taux = Number(article.tauxTva ?? 18);
  if (!Number.isFinite(taux) || taux < 0) throw new RangeError('Taux de TVA invalide.');

  const stock = Number(article.stock ?? 0);
  if (!Number.isInteger(stock)) throw new RangeError('Le stock doit etre un entier.');

  const seuil = Number(article.seuilAlerte ?? 0);
  if (!Number.isInteger(seuil) || seuil < 0) throw new RangeError("Seuil d'alerte invalide.");

  return { reference, designation, prix, taux, stock, seuil };
}

function enLigne(l) {
  return l && {
    id: l.id,
    reference: l.reference,
    designation: l.designation,
    prixUnitaire: l.prix_unitaire,
    tauxTva: l.taux_tva,
    stock: l.stock,
    seuilAlerte: l.seuil_alerte,
    actif: Boolean(l.actif),
  };
}

function creer(base, article) {
  const a = normaliser(article);
  try {
    const r = base
      .prepare(
        'INSERT INTO articles (reference, designation, prix_unitaire, taux_tva, stock, seuil_alerte) ' +
          'VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(a.reference, a.designation, a.prix, a.taux, a.stock, a.seuil);
    return lireParId(base, r.lastInsertRowid);
  } catch (erreur) {
    if (String(erreur.message).includes('UNIQUE')) {
      throw new RangeError('La reference ' + a.reference + ' existe deja.');
    }
    throw erreur;
  }
}

function modifier(base, id, article) {
  const a = normaliser(article);
  base
    .prepare(
      'UPDATE articles SET reference = ?, designation = ?, prix_unitaire = ?, ' +
        'taux_tva = ?, stock = ?, seuil_alerte = ? WHERE id = ?'
    )
    .run(a.reference, a.designation, a.prix, a.taux, a.stock, a.seuil, id);
  return lireParId(base, id);
}

function retirer(base, id) {
  // On desactive plutot que de supprimer : les tickets deja emis renvoient a l'article.
  base.prepare('UPDATE articles SET actif = 0 WHERE id = ?').run(id);
}

function lireParId(base, id) {
  return enLigne(base.prepare('SELECT * FROM articles WHERE id = ?').get(id));
}

function lireParReference(base, reference) {
  return enLigne(
    base
      .prepare('SELECT * FROM articles WHERE reference = ? AND actif = 1')
      .get(String(reference ?? '').trim().toUpperCase())
  );
}

/** Recherche par reference ou par designation, pour la barre de recherche de la caisse. */
function chercher(base, texte, { inclureInactifs = false, limite = 50 } = {}) {
  const motif = '%' + String(texte ?? '').trim() + '%';
  const filtre = inclureInactifs ? '' : ' AND actif = 1';
  return base
    .prepare(
      'SELECT * FROM articles WHERE (reference LIKE ? OR designation LIKE ?)' +
        filtre + ' ORDER BY designation LIMIT ?'
    )
    .all(motif, motif, limite)
    .map(enLigne);
}

function lister(base, { inclureInactifs = false } = {}) {
  const filtre = inclureInactifs ? '' : ' WHERE actif = 1';
  return base.prepare('SELECT * FROM articles' + filtre + ' ORDER BY designation').all().map(enLigne);
}

function sousLeSeuil(base) {
  return base
    .prepare('SELECT * FROM articles WHERE actif = 1 AND seuil_alerte > 0 AND stock <= seuil_alerte ORDER BY stock')
    .all()
    .map(enLigne);
}

module.exports = {
  creer, modifier, retirer, lireParId, lireParReference, chercher, lister, sousLeSeuil,
};

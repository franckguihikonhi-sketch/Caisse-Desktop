'use strict';

const codeBarres = require('../metier/code-barres');
const { lireParametres, ecrireParametres } = require('./base');

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

  // Le code-barres est facultatif : tout ce qu'une boutique vend n'en porte pas.
  let code = null;
  if (codeBarres.normaliser(article.codeBarres) !== '') {
    const verdict = codeBarres.verifier(article.codeBarres);
    if (!verdict.valide) throw new RangeError(verdict.motif);
    code = verdict.code;
  }

  return { reference, designation, prix, taux, stock, seuil, code };
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
    codeBarres: l.code_barres,
    actif: Boolean(l.actif),
  };
}

function creer(base, article) {
  const a = normaliser(article);
  try {
    const r = base
      .prepare(
        'INSERT INTO articles (reference, designation, prix_unitaire, taux_tva, ' +
          'stock, seuil_alerte, code_barres) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(a.reference, a.designation, a.prix, a.taux, a.stock, a.seuil, a.code);
    return lireParId(base, r.lastInsertRowid);
  } catch (erreur) {
    throw traduireCollision(erreur, a);
  }
}

/** Rend l'erreur d'unicite lisible : le message doit dire ce qui est en double. */
function traduireCollision(erreur, article) {
  const message = String(erreur.message);
  if (!message.includes('UNIQUE')) return erreur;
  if (message.includes('code_barres')) {
    return new RangeError('Le code-barres ' + article.code + ' est deja porte par un autre article.');
  }
  return new RangeError('La reference ' + article.reference + ' existe deja.');
}

function modifier(base, id, article) {
  const a = normaliser(article);
  try {
    base
      .prepare(
        'UPDATE articles SET reference = ?, designation = ?, prix_unitaire = ?, ' +
          'taux_tva = ?, stock = ?, seuil_alerte = ?, code_barres = ? WHERE id = ?'
      )
      .run(a.reference, a.designation, a.prix, a.taux, a.stock, a.seuil, a.code, id);
  } catch (erreur) {
    throw traduireCollision(erreur, a);
  }
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

/**
 * Attribue le prochain code-barres d'usage interne libre.
 *
 * Le compteur est range dans les parametres, mais on ne s'y fie pas seul : un
 * catalogue repris d'ailleurs, ou un code saisi a la main, peut deja porter le
 * numero suivant. On avance donc jusqu'a en trouver un que personne n'utilise,
 * et l'on avance le compteur dans la meme transaction, pour que deux postes ne
 * puissent pas se voir attribuer le meme.
 */
function attribuerCodeInterne(base) {
  return base.transaction(() => {
    const occupe = base.prepare('SELECT 1 FROM articles WHERE code_barres = ?');
    let numero = Number(lireParametres(base)['codeBarres.prochain_interne'] ?? 1);
    if (!Number.isInteger(numero) || numero < 1) numero = 1;

    let code = codeBarres.construireCodeInterne(numero);
    while (occupe.get(code)) {
      numero += 1;
      code = codeBarres.construireCodeInterne(numero);
    }

    ecrireParametres(base, { 'codeBarres.prochain_interne': numero + 1 });
    return { code, numero };
  })();
}

/** L'article qui porte ce code-barres, ou null. C'est ce que lit la douchette. */
function lireParCodeBarres(base, code) {
  const c = codeBarres.normaliser(code);
  if (c === '') return null;
  return enLigne(
    base.prepare('SELECT * FROM articles WHERE code_barres = ? AND actif = 1').get(c)
  );
}

/** Recherche par reference, designation ou code-barres, pour la barre de la caisse. */
function chercher(base, texte, { inclureInactifs = false, limite = 50 } = {}) {
  const motif = '%' + String(texte ?? '').trim() + '%';
  const filtre = inclureInactifs ? '' : ' AND actif = 1';
  return base
    .prepare(
      'SELECT * FROM articles WHERE (reference LIKE ? OR designation LIKE ? ' +
        'OR code_barres LIKE ?)' + filtre + ' ORDER BY designation LIMIT ?'
    )
    .all(motif, motif, motif, limite)
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
  creer, modifier, retirer, lireParId, lireParReference, lireParCodeBarres,
  chercher, lister, sousLeSeuil, attribuerCodeInterne,
};

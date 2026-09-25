'use strict';

const codeBarres = require('../metier/code-barres');
const conditionnement = require('../metier/conditionnement');
const { lireParametres, ecrireParametres } = require('./base');
const stocks = require('./stocks');

function codeOuNull(valeur, champ = 'code-barres') {
  let code = null;
  if (codeBarres.normaliser(valeur) !== '') {
    const verdict = codeBarres.verifier(valeur);
    if (!verdict.valide) throw new RangeError(champ + ' : ' + verdict.motif);
    code = verdict.code;
  }
  return code;
}

function montantOuNull(valeur, libelle) {
  if (valeur === '' || valeur === undefined || valeur === null) return null;
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(libelle + ' doit etre un entier de francs positif ou nul.');
  }
  return n;
}

function normaliser(article) {
  const reference = String(article.reference ?? '').trim().toUpperCase();
  const designation = String(article.designation ?? '').trim();
  if (!reference) throw new RangeError('La reference est obligatoire.');
  if (!designation) throw new RangeError('La designation est obligatoire.');

  const prix = Number(article.prixUnitaire);
  if (!Number.isInteger(prix) || prix < 0) {
    throw new RangeError('Le prix piece doit etre un entier de francs, positif ou nul.');
  }
  const taux = Number(article.tauxTva ?? 18);
  if (!Number.isFinite(taux) || taux < 0) throw new RangeError('Taux de TVA invalide.');

  // Stock toujours tenu en pieces, meme quand l'article se vend en carton.
  const stock = Number(article.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new RangeError('Le stock doit etre un entier positif ou nul, exprime en pieces.');
  }

  const seuil = Number(article.seuilAlerte ?? 0);
  if (!Number.isInteger(seuil) || seuil < 0) {
    throw new RangeError("Seuil d'alerte invalide : il doit etre exprime en pieces.");
  }

  const piecesParCarton = Number(article.piecesParCarton ?? 1);
  if (!Number.isInteger(piecesParCarton) || piecesParCarton < 1) {
    throw new RangeError('Le nombre de pieces par carton doit etre un entier positif.');
  }

  let prixCarton = article.prixCarton;
  if (prixCarton === '' || prixCarton === undefined) prixCarton = null;
  if (prixCarton !== null) {
    prixCarton = Number(prixCarton);
    if (!Number.isInteger(prixCarton) || prixCarton < 0) {
      throw new RangeError('Le prix carton doit etre un entier de francs positif ou nul.');
    }
  }
  if (piecesParCarton === 1) prixCarton = null;

  const prixAchatPiece = montantOuNull(article.prixAchatPiece, "Le prix d'achat piece");
  let prixAchatCarton = montantOuNull(article.prixAchatCarton, "Le prix d'achat carton");
  if (piecesParCarton === 1) prixAchatCarton = null;

  const codePiece = codeOuNull(article.codeBarres, 'code-barres piece');
  const codeCarton = piecesParCarton > 1 ? codeOuNull(article.codeBarresCarton, 'code-barres carton') : null;
  if (codePiece && codeCarton && codePiece === codeCarton) {
    throw new RangeError('Le code-barres piece et le code-barres carton doivent etre differents.');
  }

  const ventePiece = article.ventePiece === undefined ? true : Boolean(article.ventePiece);
  const venteCarton = piecesParCarton > 1 && (article.venteCarton === undefined ? true : Boolean(article.venteCarton));
  if (!ventePiece && !venteCarton) {
    throw new RangeError("L'article doit etre vendable au moins a la piece ou en carton.");
  }

  return {
    reference,
    designation,
    prix,
    taux,
    stock,
    seuil,
    codePiece,
    piecesParCarton,
    prixCarton,
    prixAchatPiece,
    prixAchatCarton,
    codeCarton,
    ventePiece,
    venteCarton,
  };
}

function sqlArticles(supplement = '') {
  const dernierPrixPiece = "(SELECT lignes_achat.prix_achat_unitaire FROM lignes_achat " +
    "JOIN achats ON achats.id = lignes_achat.achat_id " +
    "WHERE lignes_achat.article_id = articles.id AND lignes_achat.unite_achat = 'piece' " +
      "AND achats.statut = 'valide' " +
    "ORDER BY achats.date_achat DESC, achats.id DESC, lignes_achat.id DESC LIMIT 1)";
  const dernierPrixCarton = "(SELECT lignes_achat.prix_achat_unitaire FROM lignes_achat " +
    "JOIN achats ON achats.id = lignes_achat.achat_id " +
    "WHERE lignes_achat.article_id = articles.id AND lignes_achat.unite_achat = 'carton' " +
      "AND achats.statut = 'valide' " +
    "ORDER BY achats.date_achat DESC, achats.id DESC, lignes_achat.id DESC LIMIT 1)";
  return 'SELECT articles.*, ' +
    'COALESCE(articles.prix_achat_piece, ' + dernierPrixPiece + ') AS prix_achat_piece_affiche, ' +
    'COALESCE(articles.prix_achat_carton, ' + dernierPrixCarton + ') AS prix_achat_carton_affiche' +
    (supplement ? ', ' + supplement : '') +
    ' FROM articles ';
}

function enLigne(l, supplement = {}) {
  if (!l) return null;
  const article = {
    id: l.id,
    reference: l.reference,
    designation: l.designation,
    prixUnitaire: l.prix_unitaire,
    tauxTva: l.taux_tva,
    stock: l.stock,
    seuilAlerte: l.seuil_alerte,
    codeBarres: l.code_barres,
    codeBarresCarton: l.code_barres_carton,
    piecesParCarton: l.pieces_par_carton ?? 1,
    prixCarton: l.prix_carton,
    prixAchatPiece: l.prix_achat_piece_affiche ?? null,
    prixAchatCarton: l.prix_achat_carton_affiche ?? null,
    ventePiece: l.vente_piece === undefined ? true : Boolean(l.vente_piece),
    venteCarton: l.vente_carton === undefined ? false : Boolean(l.vente_carton),
    actif: Boolean(l.actif),
  };
  article.stockLibelle = conditionnement.decrireStock(article.stock, article);
  article.conditionnement = conditionnement.libelleConditionnement(article);
  return { ...article, ...supplement };
}

function creer(base, article) {
  const a = normaliser(article);
  try {
    return base.transaction(() => {
      const r = base
        .prepare(
          'INSERT INTO articles (reference, designation, prix_unitaire, taux_tva, stock, seuil_alerte, ' +
            'code_barres, pieces_par_carton, prix_carton, prix_achat_piece, prix_achat_carton, ' +
            'code_barres_carton, vente_piece, vente_carton) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        // Le stock initial passe par le journal de stock pour garder la trace.
        .run(a.reference, a.designation, a.prix, a.taux, 0, a.seuil, a.codePiece,
          a.piecesParCarton, a.prixCarton, a.prixAchatPiece, a.prixAchatCarton,
          a.codeCarton, a.ventePiece ? 1 : 0, a.venteCarton ? 1 : 0);
      if (a.stock > 0) {
        stocks.mouvement(base, {
          articleId: r.lastInsertRowid,
          type: 'entree',
          unite: 'piece',
          quantite: a.stock,
          motif: 'Stock initial',
        });
      }
      return lireParId(base, r.lastInsertRowid);
    })();
  } catch (erreur) {
    throw traduireCollision(erreur, a);
  }
}

/** Rend l'erreur d'unicite lisible : le message doit dire ce qui est en double. */
function traduireCollision(erreur, article) {
  const message = String(erreur.message);
  if (!message.includes('UNIQUE')) return erreur;
  if (message.includes('code_barres_carton')) {
    return new RangeError('Le code-barres carton ' + article.codeCarton + ' est deja porte par un autre article.');
  }
  if (message.includes('code_barres')) {
    return new RangeError('Le code-barres ' + article.codePiece + ' est deja porte par un autre article.');
  }
  return new RangeError('La reference ' + article.reference + ' existe deja.');
}

function modifier(base, id, article) {
  const a = normaliser(article);
  try {
    base.transaction(() => {
      base
        .prepare(
          'UPDATE articles SET reference = ?, designation = ?, prix_unitaire = ?, taux_tva = ?, ' +
            'seuil_alerte = ?, code_barres = ?, pieces_par_carton = ?, prix_carton = ?, ' +
            'prix_achat_piece = ?, prix_achat_carton = ?, code_barres_carton = ?, ' +
            'vente_piece = ?, vente_carton = ? WHERE id = ?'
        )
        .run(a.reference, a.designation, a.prix, a.taux, a.seuil, a.codePiece,
          a.piecesParCarton, a.prixCarton, a.prixAchatPiece, a.prixAchatCarton,
          a.codeCarton, a.ventePiece ? 1 : 0, a.venteCarton ? 1 : 0, id);
      stocks.fixerStock(base, {
        articleId: id,
        nouveauStock: a.stock,
        motif: 'Correction depuis la fiche article',
      });
    })();
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
  return enLigne(base.prepare(sqlArticles('') + 'WHERE articles.id = ?').get(id));
}

function lireParReference(base, reference) {
  return enLigne(
    base
      .prepare(sqlArticles('') + 'WHERE articles.reference = ? AND articles.actif = 1')
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
    const occupe = base.prepare('SELECT 1 FROM articles WHERE code_barres = ? OR code_barres_carton = ?');
    let numero = Number(lireParametres(base)['codeBarres.prochain_interne'] ?? 1);
    if (!Number.isInteger(numero) || numero < 1) numero = 1;

    let code = codeBarres.construireCodeInterne(numero);
    while (occupe.get(code, code)) {
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
  const ligne = base
    .prepare(sqlArticles('CASE WHEN articles.code_barres_carton = ? THEN 1 ELSE 0 END AS lu_carton') +
      'WHERE (articles.code_barres = ? OR articles.code_barres_carton = ?) AND articles.actif = 1')
    .get(c, c, c);
  if (!ligne) return null;
  const unite = ligne.lu_carton ? 'carton' : 'piece';
  return enLigne(ligne, {
    uniteScannee: unite,
    facteurScanne: conditionnement.facteurStock({ piecesParCarton: ligne.pieces_par_carton }, unite),
    prixScanne: ligne.lu_carton
      ? conditionnement.prixPourUnite({ prixUnitaire: ligne.prix_unitaire, prixCarton: ligne.prix_carton, piecesParCarton: ligne.pieces_par_carton }, 'carton')
      : ligne.prix_unitaire,
  });
}

/** Recherche par reference, designation ou code-barres, pour la barre de la caisse. */
function chercher(base, texte, { inclureInactifs = false, limite = 50 } = {}) {
  const motif = '%' + String(texte ?? '').trim() + '%';
  const filtre = inclureInactifs ? '' : ' AND articles.actif = 1';
  return base
    .prepare(
      sqlArticles('') + 'WHERE (articles.reference LIKE ? OR articles.designation LIKE ? OR articles.code_barres LIKE ? ' +
        'OR articles.code_barres_carton LIKE ?)' + filtre + ' ORDER BY articles.designation LIMIT ?'
    )
    .all(motif, motif, motif, motif, limite)
    .map(enLigne);
}

function lister(base, { inclureInactifs = false } = {}) {
  const filtre = inclureInactifs ? '' : ' WHERE articles.actif = 1';
  return base.prepare(sqlArticles('') + filtre + ' ORDER BY articles.designation').all().map(enLigne);
}

function sousLeSeuil(base) {
  return base
    .prepare(sqlArticles('') + 'WHERE articles.actif = 1 AND articles.seuil_alerte > 0 AND articles.stock <= articles.seuil_alerte ORDER BY articles.stock')
    .all()
    .map(enLigne);
}

module.exports = {
  creer, modifier, retirer, lireParId, lireParReference, lireParCodeBarres,
  chercher, lister, sousLeSeuil, attribuerCodeInterne,
};

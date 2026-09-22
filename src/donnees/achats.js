'use strict';

const { horodater, jourDe } = require('../metier/horodatage');
const conditionnement = require('../metier/conditionnement');
const panier = require('../metier/panier');
const { formater } = require('../metier/monnaie');
const caisse = require('./caisse');
const fournisseurs = require('./fournisseurs');
const stocks = require('./stocks');

const MODES_REGLEMENT = ['especes', 'mobile', 'carte', 'credit'];

function texteOuNull(valeur) {
  const texte = String(valeur ?? '').trim();
  return texte === '' ? null : texte;
}

function entierStrict(nom, valeur) {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n <= 0) throw new RangeError(nom + ' doit etre un entier positif.');
  return n;
}

function montantPositif(nom, valeur) {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < 0) throw new RangeError(nom + ' doit etre un montant entier positif ou nul.');
  return n;
}

function tauxTva(valeur, defaut = 0) {
  const n = Number(valeur ?? defaut);
  if (!Number.isFinite(n) || n < 0) throw new RangeError('Taux de TVA invalide.');
  return n;
}

function modeReglement(valeur) {
  const mode = String(valeur ?? 'credit').trim();
  if (!MODES_REGLEMENT.includes(mode)) throw new RangeError('Mode de reglement achat inconnu.');
  return mode;
}

function lireFournisseurActif(base, id) {
  const fournisseur = fournisseurs.lire(base, id);
  if (!fournisseur || !fournisseur.actif) throw new RangeError('Fournisseur introuvable ou desactive.');
  return fournisseur;
}

function lireArticle(base, ligne) {
  let article = null;
  if (ligne.articleId) {
    article = base.prepare('SELECT * FROM articles WHERE id = ? AND actif = 1').get(ligne.articleId);
  } else if (ligne.reference) {
    article = base.prepare('SELECT * FROM articles WHERE reference = ? AND actif = 1')
      .get(String(ligne.reference).trim().toUpperCase());
  }
  if (!article) throw new RangeError('Article introuvable dans une ligne d achat.');
  return {
    id: article.id,
    reference: article.reference,
    designation: article.designation,
    tauxTva: article.taux_tva,
    piecesParCarton: article.pieces_par_carton ?? 1,
    stock: article.stock,
  };
}

function preparerLignes(base, lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new RangeError('Un achat doit contenir au moins une ligne de marchandise.');
  }
  if (lignes.length > 200) throw new RangeError('Un achat ne peut pas depasser 200 lignes.');

  return lignes.map((ligne, index) => {
    const article = lireArticle(base, ligne);
    const unite = conditionnement.normaliserUnite(ligne.uniteAchat ?? ligne.unite ?? 'piece');
    if (unite === 'carton' && conditionnement.piecesParCarton(article) <= 1) {
      throw new RangeError(article.designation + ' n a pas de conditionnement carton.');
    }
    const quantite = entierStrict('La quantite de la ligne ' + (index + 1), ligne.quantite);
    const prixAchatUnitaire = montantPositif('Le prix achat de la ligne ' + (index + 1), ligne.prixAchatUnitaire);
    if (prixAchatUnitaire === 0) throw new RangeError('Le prix achat de la ligne ' + (index + 1) + ' doit etre superieur a 0.');
    const facteur = conditionnement.facteurStock(article, unite);
    const quantiteStock = quantite * facteur;
    const taux = tauxTva(ligne.tauxTva, article.tauxTva);

    return {
      articleId: article.id,
      reference: article.reference,
      designation: article.designation,
      uniteAchat: unite,
      facteurStock: facteur,
      quantite,
      quantiteStock,
      prixAchatUnitaire,
      tauxTva: taux,
      totalTtc: prixAchatUnitaire * quantite,
      piecesParCarton: conditionnement.piecesParCarton(article),
    };
  });
}

function calculerAchat(lignes) {
  return panier.calculer(lignes.map((l) => ({
    reference: l.reference,
    designation: l.designation,
    prixUnitaire: l.prixAchatUnitaire,
    quantite: l.quantite,
    tauxTva: l.tauxTva,
    uniteVente: l.uniteAchat,
    facteurStock: l.facteurStock,
  })));
}

function numeroSuivant(base, date) {
  const j = jourDe(date).replace(/-/g, '');
  const derniere = base.prepare('SELECT numero FROM achats WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1')
    .get('ACH-' + j + '-%');
  const rang = derniere ? Number(derniere.numero.split('-')[2]) + 1 : 1;
  return 'ACH-' + j + '-' + String(rang).padStart(4, '0');
}

function enregistrer(base, donnees) {
  return base.transaction(() => {
    const fournisseur = lireFournisseurActif(base, donnees.fournisseurId);
    const lignes = preparerLignes(base, donnees.lignes);
    const total = calculerAchat(lignes);
    if (total.totalTtc <= 0) throw new RangeError('Le total achat doit etre superieur a zero.');

    const mode = modeReglement(donnees.modeReglement ?? donnees.modePaiement);
    const date = donnees.dateAchat || horodater();
    const numero = texteOuNull(donnees.numero) || numeroSuivant(base, date);
    const referenceDocument = texteOuNull(donnees.referenceDocument ?? donnees.reference);
    const note = texteOuNull(donnees.note);
    const session = mode === 'credit' ? null : caisse.exigerOuverte(base);

    const ins = base.prepare(
      'INSERT INTO achats (numero, date_achat, fournisseur_id, utilisateur_id, caisse_id, reference_document, ' +
        'mode_reglement, total_brut, total_ht, total_tva, total_ttc, statut, note) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valide', ?)"
    ).run(
      numero,
      date,
      fournisseur.id,
      donnees.utilisateurId ?? null,
      session?.id ?? null,
      referenceDocument,
      mode,
      total.totalBrut,
      total.totalHt,
      total.totalTva,
      total.totalTtc,
      note
    );
    const achatId = ins.lastInsertRowid;

    const insererLigne = base.prepare(
      'INSERT INTO lignes_achat (achat_id, article_id, reference, designation, unite_achat, facteur_stock, ' +
        'quantite, quantite_stock, prix_achat_unitaire, taux_tva, total_ttc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const ligne of lignes) {
      insererLigne.run(
        achatId,
        ligne.articleId,
        ligne.reference,
        ligne.designation,
        ligne.uniteAchat,
        ligne.facteurStock,
        ligne.quantite,
        ligne.quantiteStock,
        ligne.prixAchatUnitaire,
        ligne.tauxTva,
        ligne.totalTtc
      );
      stocks.mouvement(base, {
        articleId: ligne.articleId,
        type: 'entree',
        unite: ligne.uniteAchat,
        quantite: ligne.quantite,
        motif: 'Achat marchandise ' + numero,
        reference: referenceDocument || numero,
        fournisseurId: fournisseur.id,
        achatId,
        utilisateurId: donnees.utilisateurId,
      });
    }

    const dette = fournisseurs.creerDette(base, {
      fournisseurId: fournisseur.id,
      montantInitial: total.totalTtc,
      dateCreation: date,
      dateEcheance: donnees.dateEcheance,
      libelle: 'Achat marchandise ' + numero,
      note: [referenceDocument ? 'Document ' + referenceDocument : null, note].filter(Boolean).join(' - '),
    });
    base.prepare('UPDATE achats SET dette_id = ? WHERE id = ?').run(dette.id, achatId);

    if (mode !== 'credit') {
      fournisseurs.enregistrerReglement(base, {
        detteId: dette.id,
        montant: total.totalTtc,
        modePaiement: mode,
        reference: referenceDocument || numero,
        utilisateurId: donnees.utilisateurId,
        note: 'Paiement achat ' + numero,
      });
    }

    return lire(base, achatId);
  })();
}

function enAchat(l) {
  if (!l) return null;
  return {
    id: l.id,
    numero: l.numero,
    dateAchat: l.date_achat,
    fournisseurId: l.fournisseur_id,
    fournisseurNom: l.fournisseur_nom,
    fournisseurCode: l.fournisseur_code,
    utilisateurId: l.utilisateur_id,
    utilisateur: l.utilisateur,
    caisseId: l.caisse_id,
    detteId: l.dette_id,
    detteNumero: l.dette_numero,
    detteStatut: l.dette_statut,
    detteSolde: l.dette_solde ?? 0,
    referenceDocument: l.reference_document,
    modeReglement: l.mode_reglement,
    totalBrut: l.total_brut,
    totalHt: l.total_ht,
    totalTva: l.total_tva,
    totalTtc: l.total_ttc,
    statut: l.statut,
    note: l.note,
    annuleLe: l.annule_le,
    motifAnnulation: l.motif_annulation,
  };
}

function enLigne(l) {
  if (!l) return null;
  const article = { piecesParCarton: l.article_pieces_par_carton ?? l.facteur_stock ?? 1 };
  return {
    id: l.id,
    achatId: l.achat_id,
    articleId: l.article_id,
    reference: l.reference,
    designation: l.designation,
    uniteAchat: l.unite_achat,
    facteurStock: l.facteur_stock,
    quantite: l.quantite,
    quantiteStock: l.quantite_stock,
    quantiteStockLibelle: conditionnement.decrireStock(l.quantite_stock, article),
    prixAchatUnitaire: l.prix_achat_unitaire,
    tauxTva: l.taux_tva,
    totalTtc: l.total_ttc,
  };
}

function sqlAchatBase() {
  return 'SELECT achats.*, fournisseurs.nom AS fournisseur_nom, fournisseurs.code AS fournisseur_code, ' +
    'utilisateurs.nom AS utilisateur, dettes_fournisseurs.numero AS dette_numero, ' +
    'dettes_fournisseurs.statut AS dette_statut, dettes_fournisseurs.solde AS dette_solde ' +
    'FROM achats JOIN fournisseurs ON fournisseurs.id = achats.fournisseur_id ' +
    'LEFT JOIN utilisateurs ON utilisateurs.id = achats.utilisateur_id ' +
    'LEFT JOIN dettes_fournisseurs ON dettes_fournisseurs.id = achats.dette_id ';
}

function lignesAchat(base, achatId) {
  return base.prepare(
    'SELECT lignes_achat.*, articles.pieces_par_carton AS article_pieces_par_carton FROM lignes_achat ' +
      'LEFT JOIN articles ON articles.id = lignes_achat.article_id ' +
      'WHERE achat_id = ? ORDER BY lignes_achat.id'
  ).all(achatId).map(enLigne);
}

function lire(base, id) {
  const achat = enAchat(base.prepare(sqlAchatBase() + 'WHERE achats.id = ?').get(id));
  if (!achat) return null;
  return { ...achat, lignes: lignesAchat(base, achat.id) };
}

function lister(base, { fournisseurId = null, limite = 80, inclureAnnules = true } = {}) {
  const conditions = [];
  const params = [];
  if (fournisseurId) {
    conditions.push('achats.fournisseur_id = ?');
    params.push(fournisseurId);
  }
  if (!inclureAnnules) conditions.push("achats.statut = 'valide'");
  const borne = Math.max(1, Math.min(300, Number(limite) || 80));
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' ' : '';
  return base.prepare(sqlAchatBase() + where + 'ORDER BY achats.id DESC LIMIT ?')
    .all(...params, borne)
    .map(enAchat);
}

function annuler(base, id, motif = '', utilisateurId = null) {
  return base.transaction(() => {
    const achat = lire(base, id);
    if (!achat) throw new RangeError('Achat introuvable.');
    if (achat.statut === 'annule') throw new RangeError('Cet achat est deja annule.');

    const dette = achat.detteId ? fournisseurs.lireDette(base, achat.detteId) : null;
    if (dette && (dette.statut !== 'ouverte' || dette.solde !== dette.montantInitial)) {
      throw new RangeError(
        'Cet achat a deja un reglement fournisseur (' + formater(dette.montantInitial - dette.solde) +
        '). Annulation automatique refusee pour garder la caisse exacte.'
      );
    }

    const raison = texteOuNull(motif) || 'Annulation achat ' + achat.numero;
    for (const ligne of achat.lignes) {
      stocks.mouvement(base, {
        articleId: ligne.articleId,
        type: 'sortie',
        unite: ligne.uniteAchat,
        quantite: ligne.quantite,
        motif: 'Annulation achat ' + achat.numero + ' - ' + raison,
        reference: achat.referenceDocument || achat.numero,
        fournisseurId: achat.fournisseurId,
        achatId: achat.id,
        utilisateurId,
      });
    }

    if (dette) {
      base.prepare("UPDATE dettes_fournisseurs SET solde = 0, statut = 'annulee', note = COALESCE(note || ' - ', '') || ? WHERE id = ?")
        .run('Annulee avec achat ' + achat.numero, dette.id);
    }
    base.prepare("UPDATE achats SET statut = 'annule', annule_le = ?, motif_annulation = ? WHERE id = ?")
      .run(horodater(), raison, achat.id);
    return lire(base, achat.id);
  })();
}

function synthese(base, { date = null } = {}) {
  const condition = date ? ' AND date(date_achat) = ?' : '';
  const params = date ? [date] : [];
  return base.prepare(
    "SELECT COUNT(*) AS nombre, COALESCE(SUM(total_ttc), 0) AS total FROM achats " +
      "WHERE statut = 'valide'" + condition
  ).get(...params);
}

module.exports = { enregistrer, lire, lister, annuler, synthese };

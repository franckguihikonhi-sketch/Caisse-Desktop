'use strict';

const { horodater, jourDe } = require('../metier/horodatage');
const conditionnement = require('../metier/conditionnement');
const panier = require('../metier/panier');
const { formater } = require('../metier/monnaie');
const { exigerMotif } = require('../metier/motif-obligatoire');
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

function numeroRetourSuivant(base, date) {
  const j = jourDe(date).replace(/-/g, '');
  const derniere = base.prepare('SELECT numero FROM retours_fournisseurs WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1')
    .get('RF-' + j + '-%');
  const rang = derniere ? Number(derniere.numero.split('-')[2]) + 1 : 1;
  return 'RF-' + j + '-' + String(rang).padStart(4, '0');
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
    totalRetours: l.total_retours ?? 0,
    montantNet: Math.max(0, l.total_ttc - (l.total_retours ?? 0)),
    montantAvoirRetour: l.montant_avoir_retour ?? 0,
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
    'dettes_fournisseurs.statut AS dette_statut, dettes_fournisseurs.solde AS dette_solde, ' +
    "COALESCE((SELECT SUM(total_ttc) FROM retours_fournisseurs WHERE achat_id = achats.id AND statut = 'valide'), 0) AS total_retours, " +
    "COALESCE((SELECT SUM(montant_avoir) FROM retours_fournisseurs WHERE achat_id = achats.id AND statut = 'valide'), 0) AS montant_avoir_retour " +
    'FROM achats JOIN fournisseurs ON fournisseurs.id = achats.fournisseur_id ' +
    'LEFT JOIN utilisateurs ON utilisateurs.id = achats.utilisateur_id ' +
    'LEFT JOIN dettes_fournisseurs ON dettes_fournisseurs.id = achats.dette_id ';
}

function quantitesRetournees(base, achatId) {
  return new Map(base.prepare(
    'SELECT lignes_retour_fournisseur.ligne_achat_id AS ligne_id, ' +
      'COALESCE(SUM(lignes_retour_fournisseur.quantite), 0) AS quantite, ' +
      'COALESCE(SUM(lignes_retour_fournisseur.quantite_stock), 0) AS quantite_stock ' +
      'FROM lignes_retour_fournisseur ' +
      'JOIN retours_fournisseurs ON retours_fournisseurs.id = lignes_retour_fournisseur.retour_id ' +
      "WHERE retours_fournisseurs.achat_id = ? AND retours_fournisseurs.statut = 'valide' " +
      'GROUP BY lignes_retour_fournisseur.ligne_achat_id'
  ).all(achatId).map((r) => [r.ligne_id, r]));
}

function lignesAchat(base, achatId) {
  const retournees = quantitesRetournees(base, achatId);
  return base.prepare(
    'SELECT lignes_achat.*, articles.pieces_par_carton AS article_pieces_par_carton FROM lignes_achat ' +
      'LEFT JOIN articles ON articles.id = lignes_achat.article_id ' +
      'WHERE achat_id = ? ORDER BY lignes_achat.id'
  ).all(achatId).map(enLigne).map((ligne) => {
    const r = retournees.get(ligne.id) ?? { quantite: 0, quantite_stock: 0 };
    const quantiteRetournee = r.quantite ?? 0;
    const quantiteStockRetournee = r.quantite_stock ?? 0;
    return {
      ...ligne,
      quantiteRetournee,
      quantiteStockRetournee,
      quantiteRetourable: Math.max(0, ligne.quantite - quantiteRetournee),
      quantiteStockRetourable: Math.max(0, ligne.quantiteStock - quantiteStockRetournee),
      retourComplet: quantiteStockRetournee >= ligne.quantiteStock,
    };
  });
}

function lire(base, id) {
  const achat = enAchat(base.prepare(sqlAchatBase() + 'WHERE achats.id = ?').get(id));
  if (!achat) return null;
  return { ...achat, lignes: lignesAchat(base, achat.id), retours: retoursAchat(base, achat.id) };
}


function enRetour(l) {
  if (!l) return null;
  return {
    id: l.id,
    numero: l.numero,
    dateRetour: l.date_retour,
    fournisseurId: l.fournisseur_id,
    fournisseurNom: l.fournisseur_nom,
    fournisseurCode: l.fournisseur_code,
    achatId: l.achat_id,
    achatNumero: l.achat_numero,
    detteId: l.dette_id,
    utilisateurId: l.utilisateur_id,
    utilisateur: l.utilisateur,
    referenceDocument: l.reference_document,
    totalTtc: l.total_ttc,
    montantDeduitDette: l.montant_deduit_dette,
    montantAvoir: l.montant_avoir,
    statut: l.statut,
    note: l.note,
    annuleLe: l.annule_le,
    motifAnnulation: l.motif_annulation,
  };
}

function enLigneRetour(l) {
  if (!l) return null;
  const article = { piecesParCarton: l.article_pieces_par_carton ?? l.facteur_stock ?? 1 };
  return {
    id: l.id,
    retourId: l.retour_id,
    ligneAchatId: l.ligne_achat_id,
    articleId: l.article_id,
    reference: l.reference,
    designation: l.designation,
    uniteRetour: l.unite_retour,
    facteurStock: l.facteur_stock,
    quantite: l.quantite,
    quantiteStock: l.quantite_stock,
    quantiteStockLibelle: conditionnement.decrireStock(l.quantite_stock, article),
    prixAchatUnitaire: l.prix_achat_unitaire,
    totalTtc: l.total_ttc,
  };
}

function sqlRetourBase() {
  return 'SELECT retours_fournisseurs.*, fournisseurs.nom AS fournisseur_nom, fournisseurs.code AS fournisseur_code, ' +
    'achats.numero AS achat_numero, utilisateurs.nom AS utilisateur ' +
    'FROM retours_fournisseurs ' +
    'JOIN fournisseurs ON fournisseurs.id = retours_fournisseurs.fournisseur_id ' +
    'JOIN achats ON achats.id = retours_fournisseurs.achat_id ' +
    'LEFT JOIN utilisateurs ON utilisateurs.id = retours_fournisseurs.utilisateur_id ';
}

function lignesRetour(base, retourId) {
  return base.prepare(
    'SELECT lignes_retour_fournisseur.*, articles.pieces_par_carton AS article_pieces_par_carton ' +
      'FROM lignes_retour_fournisseur ' +
      'LEFT JOIN articles ON articles.id = lignes_retour_fournisseur.article_id ' +
      'WHERE retour_id = ? ORDER BY lignes_retour_fournisseur.id'
  ).all(retourId).map(enLigneRetour);
}

function lireRetour(base, id) {
  const retour = enRetour(base.prepare(sqlRetourBase() + 'WHERE retours_fournisseurs.id = ?').get(id));
  if (!retour) return null;
  return { ...retour, lignes: lignesRetour(base, retour.id) };
}

function retoursAchat(base, achatId) {
  return base.prepare(
    sqlRetourBase() + 'WHERE retours_fournisseurs.achat_id = ? ORDER BY retours_fournisseurs.id DESC'
  ).all(achatId).map(enRetour).map((retour) => ({ ...retour, lignes: lignesRetour(base, retour.id) }));
}

function listerRetours(base, { achatId = null, fournisseurId = null, limite = 100, inclureAnnules = true } = {}) {
  const conditions = [];
  const params = [];
  if (achatId) {
    conditions.push('retours_fournisseurs.achat_id = ?');
    params.push(achatId);
  }
  if (fournisseurId) {
    conditions.push('retours_fournisseurs.fournisseur_id = ?');
    params.push(fournisseurId);
  }
  if (!inclureAnnules) conditions.push("retours_fournisseurs.statut = 'valide'");
  const borne = Math.max(1, Math.min(300, Number(limite) || 100));
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' ' : '';
  return base.prepare(sqlRetourBase() + where + 'ORDER BY retours_fournisseurs.id DESC LIMIT ?')
    .all(...params, borne)
    .map(enRetour);
}

function preparerLignesRetour(achat, lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new RangeError('Un retour fournisseur doit contenir au moins une ligne.');
  }
  const cumuls = new Map();
  for (const ligne of lignes) {
    const ligneAchatId = Number(ligne.ligneAchatId ?? ligne.id);
    const quantite = Number(ligne.quantite);
    if (!Number.isInteger(ligneAchatId) || ligneAchatId <= 0) {
      throw new RangeError('Ligne d achat invalide dans le retour fournisseur.');
    }
    if (!Number.isInteger(quantite) || quantite < 0) {
      throw new RangeError('La quantite retour doit etre un entier positif.');
    }
    if (quantite === 0) continue;
    cumuls.set(ligneAchatId, (cumuls.get(ligneAchatId) ?? 0) + quantite);
  }
  if (cumuls.size === 0) throw new RangeError('Indiquez au moins une quantite a retourner.');

  const preparees = [];
  for (const [ligneAchatId, quantite] of cumuls.entries()) {
    const originale = achat.lignes.find((l) => l.id === ligneAchatId);
    if (!originale) throw new RangeError('La ligne retournee ne fait pas partie de cet achat.');
    if (quantite > originale.quantiteRetourable) {
      throw new RangeError(
        'Retour trop eleve pour ' + originale.designation +
          ' : reste ' + originale.quantiteRetourable + ' ' + conditionnement.libelleUnite(originale.uniteAchat, originale.quantiteRetourable) +
          ' a retourner.'
      );
    }
    preparees.push({
      ...originale,
      quantite,
      quantiteStock: quantite * originale.facteurStock,
      totalTtc: quantite * originale.prixAchatUnitaire,
    });
  }
  return preparees;
}

function reduireDettePourRetour(base, achat, totalRetour, numeroRetour) {
  if (!achat.detteId || totalRetour <= 0) return { deduit: 0, avoir: totalRetour };
  const dette = fournisseurs.lireDette(base, achat.detteId);
  if (!dette || dette.solde <= 0 || !['ouverte', 'partielle'].includes(dette.statut)) {
    return { deduit: 0, avoir: totalRetour };
  }
  const deduit = Math.min(totalRetour, dette.solde);
  const nouveauSolde = dette.solde - deduit;
  const statut = nouveauSolde === 0 ? 'reglee' : 'partielle';
  base.prepare(
    "UPDATE dettes_fournisseurs SET solde = ?, statut = ?, note = TRIM(COALESCE(note, '') || ?) WHERE id = ?"
  ).run(
    nouveauSolde,
    statut,
    ' Retour fournisseur ' + numeroRetour + ' deduit ' + formater(deduit) + '.',
    dette.id
  );
  return { deduit, avoir: totalRetour - deduit };
}

function restaurerDetteApresAnnulationRetour(base, retour) {
  if (!retour.detteId || retour.montantDeduitDette <= 0) return;
  const dette = fournisseurs.lireDette(base, retour.detteId);
  if (!dette) throw new RangeError('Dette fournisseur introuvable pour annuler le retour.');
  const nouveauSolde = dette.solde + retour.montantDeduitDette;
  if (nouveauSolde > dette.montantInitial) {
    throw new RangeError('Annulation refusee : la dette fournisseur deviendrait superieure au montant initial.');
  }
  const statut = nouveauSolde === 0 ? 'reglee' : (nouveauSolde === dette.montantInitial ? 'ouverte' : 'partielle');
  base.prepare(
    "UPDATE dettes_fournisseurs SET solde = ?, statut = ?, note = TRIM(COALESCE(note, '') || ?) WHERE id = ?"
  ).run(
    nouveauSolde,
    statut,
    ' Annulation retour fournisseur ' + retour.numero + ' +' + formater(retour.montantDeduitDette) + '.',
    dette.id
  );
}

function retourner(base, donnees) {
  return base.transaction(() => {
    const achat = lire(base, donnees.achatId);
    if (!achat) throw new RangeError('Achat introuvable.');
    if (achat.statut !== 'valide') throw new RangeError('Impossible de retourner un article sur un achat annule.');
    const lignes = preparerLignesRetour(achat, donnees.lignes);
    const total = lignes.reduce((s, l) => s + l.totalTtc, 0);
    if (total <= 0) throw new RangeError('Le montant du retour doit etre superieur a zero.');

    const date = donnees.dateRetour || horodater();
    const numero = texteOuNull(donnees.numero) || numeroRetourSuivant(base, date);
    const referenceDocument = texteOuNull(donnees.referenceDocument ?? donnees.reference);
    const note = texteOuNull(donnees.note);
    const finance = reduireDettePourRetour(base, achat, total, numero);

    const ins = base.prepare(
      'INSERT INTO retours_fournisseurs (numero, date_retour, fournisseur_id, achat_id, dette_id, utilisateur_id, ' +
        'reference_document, total_ttc, montant_deduit_dette, montant_avoir, statut, note) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valide', ?)"
    ).run(
      numero,
      date,
      achat.fournisseurId,
      achat.id,
      achat.detteId,
      donnees.utilisateurId ?? null,
      referenceDocument,
      total,
      finance.deduit,
      finance.avoir,
      note
    );
    const retourId = ins.lastInsertRowid;

    const insererLigne = base.prepare(
      'INSERT INTO lignes_retour_fournisseur (retour_id, ligne_achat_id, article_id, reference, designation, ' +
        'unite_retour, facteur_stock, quantite, quantite_stock, prix_achat_unitaire, total_ttc) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const ligne of lignes) {
      insererLigne.run(
        retourId,
        ligne.id,
        ligne.articleId,
        ligne.reference,
        ligne.designation,
        ligne.uniteAchat,
        ligne.facteurStock,
        ligne.quantite,
        ligne.quantiteStock,
        ligne.prixAchatUnitaire,
        ligne.totalTtc
      );
      stocks.mouvement(base, {
        articleId: ligne.articleId,
        type: 'sortie',
        unite: ligne.uniteAchat,
        quantite: ligne.quantite,
        motif: 'Retour fournisseur ' + numero + ' - achat ' + achat.numero,
        reference: referenceDocument || numero,
        fournisseurId: achat.fournisseurId,
        achatId: achat.id,
        retourFournisseurId: retourId,
        utilisateurId: donnees.utilisateurId,
      });
    }

    return lireRetour(base, retourId);
  })();
}

function annulerRetour(base, id, motif = '', utilisateurId = null) {
  return base.transaction(() => {
    const retour = lireRetour(base, id);
    if (!retour) throw new RangeError('Retour fournisseur introuvable.');
    if (retour.statut === 'annule') throw new RangeError('Ce retour fournisseur est deja annule.');
    const raison = exigerMotif(motif, 'L annulation du retour fournisseur ' + retour.numero);

    for (const ligne of retour.lignes) {
      stocks.mouvement(base, {
        articleId: ligne.articleId,
        type: 'retour',
        unite: ligne.uniteRetour,
        quantite: ligne.quantite,
        motif: 'Annulation retour fournisseur ' + retour.numero + ' - ' + raison,
        reference: retour.referenceDocument || retour.numero,
        fournisseurId: retour.fournisseurId,
        achatId: retour.achatId,
        retourFournisseurId: retour.id,
        utilisateurId,
      });
    }
    restaurerDetteApresAnnulationRetour(base, retour);
    base.prepare("UPDATE retours_fournisseurs SET statut = 'annule', annule_le = ?, motif_annulation = ? WHERE id = ?")
      .run(horodater(), raison, retour.id);
    return lireRetour(base, retour.id);
  })();
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

    const raison = exigerMotif(motif, 'L annulation de l achat ' + achat.numero);
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

module.exports = { enregistrer, lire, lister, annuler, retourner, lireRetour, listerRetours, annulerRetour, synthese };

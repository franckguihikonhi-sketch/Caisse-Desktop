'use strict';

const { calculer } = require('../metier/panier');
const { horodater, jourDe } = require('../metier/horodatage');
const { arrondirEspeces, rendreMonnaie, formater } = require('../metier/monnaie');
const conditionnement = require('../metier/conditionnement');
const articles = require('./articles');
const clients = require('./clients');
const caisse = require('./caisse');
const stocks = require('./stocks');

const MODES_REMBOURSEMENT_RETOUR = ['avoir', 'especes', 'mobile', 'carte'];

function numeroSuivant(base, horodatage) {
  const jour = jourDe(horodatage).replace(/-/g, '');
  const derniere = base
    .prepare("SELECT numero FROM ventes WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1")
    .get('V-' + jour + '-%');
  const rang = derniere ? Number(derniere.numero.split('-')[2]) + 1 : 1;
  return 'V-' + jour + '-' + String(rang).padStart(4, '0');
}

function numeroRetourClientSuivant(base, horodatage) {
  const jour = jourDe(horodatage).replace(/-/g, '');
  const derniere = base
    .prepare("SELECT numero FROM retours_clients WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1")
    .get('RC-' + jour + '-%');
  const rang = derniere ? Number(derniere.numero.split('-')[2]) + 1 : 1;
  return 'RC-' + jour + '-' + String(rang).padStart(4, '0');
}

/**
 * Enregistre une vente. Le panier envoye par l'interface n'est pas cru sur
 * parole : prix, taux et stock sont relus dans la base, et le total est
 * recalcule ici. L'ecriture, le decompte du stock et la numerotation tiennent
 * dans une seule transaction, pour qu'une vente soit entiere ou inexistante.
 */
function enregistrer(base, {
  lignes,
  remiseGlobalePourcent = 0,
  paiement,
  utilisateurId,
  clientId = null,
  exigerCaisse = false,
}) {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new RangeError('Le panier est vide.');
  }
  const modes = ['especes', 'mobile', 'carte', 'credit'];
  if (!paiement || !modes.includes(paiement.mode)) {
    throw new RangeError('Mode de paiement inconnu.');
  }
  if (paiement.mode === 'credit' && !clientId) {
    throw new RangeError('Une vente a credit doit etre rattachee a un client.');
  }

  const transaction = base.transaction(() => {
    const sessionCaisse = exigerCaisse ? caisse.exigerOuverte(base) : caisse.ouverte(base);
    const lignesVerifiees = lignes.map((l) => {
      const article = articles.lireParReference(base, l.reference);
      if (!article) throw new RangeError('Article inconnu : ' + l.reference + '.');
      if (!Number.isInteger(l.quantite) || l.quantite <= 0) {
        throw new RangeError('Quantite invalide pour ' + article.designation + '.');
      }
      const uniteVente = conditionnement.normaliserUnite(l.uniteVente ?? l.unite ?? 'piece');
      conditionnement.verifierVendable(article, uniteVente);
      const facteurStock = conditionnement.facteurStock(article, uniteVente);
      const quantiteStock = l.quantite * facteurStock;
      if (article.stock < quantiteStock) {
        throw new RangeError(
          'Stock insuffisant pour ' + article.designation +
            ' : ' + conditionnement.decrireStock(article.stock, article) +
            ' en rayon, ' + conditionnement.decrireStock(quantiteStock, article) + ' demandes.'
        );
      }
      return {
        articleId: article.id,
        reference: article.reference,
        designation: article.designation,
        prixUnitaire: conditionnement.prixPourUnite(article, uniteVente),
        tauxTva: article.tauxTva,
        quantite: l.quantite,
        uniteVente,
        facteurStock,
        quantiteStock,
        remisePourcent: l.remisePourcent ?? 0,
      };
    });

    const panier = calculer(lignesVerifiees, { remiseGlobalePourcent });

    let client = null;
    if (paiement.mode === 'credit') {
      client = clients.verifierCreditPossible(base, clientId, panier.totalTtc);
    } else if (clientId) {
      client = clients.lire(base, clientId);
      if (!client || !client.actif) throw new RangeError('Client introuvable ou desactive.');
    }

    let montantRecu = null;
    let monnaieRendue = null;
    if (paiement.mode === 'especes') {
      const du = arrondirEspeces(panier.totalTtc);
      const monnaie = rendreMonnaie(du, paiement.montantRecu ?? du);
      montantRecu = monnaie.montantRecu;
      monnaieRendue = monnaie.rendu;
    }

    const date = horodater();
    const numero = numeroSuivant(base, date);

    const modeStocke = paiement.mode === 'credit' ? 'carte' : paiement.mode;
    const vente = base
      .prepare(
        'INSERT INTO ventes (numero, date_vente, utilisateur_id, total_brut, remise, ' +
          'total_ttc, total_ht, total_tva, mode_paiement, montant_recu, monnaie_rendue, ' +
          'caisse_id, client_id, paiement_credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(numero, date, utilisateurId, panier.totalBrut, panier.remise, panier.totalTtc,
        panier.totalHt, panier.totalTva, modeStocke, montantRecu, monnaieRendue,
        sessionCaisse?.id ?? null, client?.id ?? null, paiement.mode === 'credit' ? 1 : 0);

    const poserLigne = base.prepare(
      'INSERT INTO lignes_vente (vente_id, article_id, reference, designation, prix_unitaire, ' +
        'quantite, taux_tva, remise_pourcent, total_ttc, unite_vente, facteur_stock) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    panier.lignes.forEach((l, i) => {
      const source = lignesVerifiees[i];
      poserLigne.run(vente.lastInsertRowid, source.articleId, l.reference, l.designation,
        l.prixUnitaire, l.quantite, l.tauxTva, l.remisePourcent, l.totalTtc,
        source.uniteVente, source.facteurStock);
      stocks.mouvement(base, {
        articleId: source.articleId,
        type: 'sortie',
        unite: source.uniteVente,
        quantite: l.quantite,
        motif: 'Vente ' + numero,
        venteId: vente.lastInsertRowid,
        utilisateurId,
      });
    });

    if (paiement.mode === 'credit') {
      clients.creerCreanceVente(base, {
        clientId: client.id,
        venteId: vente.lastInsertRowid,
        numeroVente: numero,
        montant: panier.totalTtc,
        dateCreation: date,
      });
    }

    return {
      id: vente.lastInsertRowid,
      numero,
      date,
      panier,
      client,
      paiement: { mode: paiement.mode, montantRecu, rendu: monnaieRendue },
    };
  });

  return transaction();
}

function facturesCreditClient(base, clientId) {
  if (!clientId) return [];
  return base.prepare(
    'SELECT creances_clients.*, ventes.numero AS vente_numero FROM creances_clients ' +
      'LEFT JOIN ventes ON ventes.id = creances_clients.vente_id ' +
      "WHERE creances_clients.client_id = ? AND creances_clients.statut IN ('ouverte', 'partielle') " +
        'AND creances_clients.solde > 0 ' +
      'ORDER BY creances_clients.date_creation, creances_clients.id'
  ).all(clientId).map((c) => ({
    numero: c.vente_numero || c.numero,
    creanceNumero: c.numero,
    libelle: c.libelle,
    dateCreation: c.date_creation,
    montantInitial: c.montant_initial,
    solde: c.solde,
  }));
}


function modeRemboursementRetour(valeur) {
  const mode = String(valeur ?? 'avoir').trim();
  if (!MODES_REMBOURSEMENT_RETOUR.includes(mode)) {
    throw new RangeError('Mode de remboursement retour client inconnu.');
  }
  return mode;
}

function quantitesRetournees(base, venteId) {
  return new Map(base.prepare(
    'SELECT lignes_retour_client.ligne_vente_id AS ligne_id, ' +
      'COALESCE(SUM(lignes_retour_client.quantite), 0) AS quantite, ' +
      'COALESCE(SUM(lignes_retour_client.quantite_stock), 0) AS quantite_stock, ' +
      'COALESCE(SUM(lignes_retour_client.total_ttc), 0) AS total_ttc ' +
      'FROM lignes_retour_client ' +
      'JOIN retours_clients ON retours_clients.id = lignes_retour_client.retour_id ' +
      "WHERE retours_clients.vente_id = ? AND retours_clients.statut = 'valide' " +
      'GROUP BY lignes_retour_client.ligne_vente_id'
  ).all(venteId).map((r) => [r.ligne_id, r]));
}

function lignesVente(base, venteId) {
  const retournees = quantitesRetournees(base, venteId);
  return base
    .prepare(
      'SELECT lignes_vente.*, articles.pieces_par_carton AS article_pieces_par_carton FROM lignes_vente ' +
        'LEFT JOIN articles ON articles.id = lignes_vente.article_id ' +
        'WHERE vente_id = ? ORDER BY lignes_vente.id'
    )
    .all(venteId)
    .map((l) => {
      const r = retournees.get(l.id) ?? { quantite: 0, quantite_stock: 0, total_ttc: 0 };
      const quantiteRetournee = r.quantite ?? 0;
      const quantiteStockRetournee = r.quantite_stock ?? 0;
      const totalRetourne = r.total_ttc ?? 0;
      const piecesParCarton = l.article_pieces_par_carton ?? l.facteur_stock ?? 1;
      return {
        id: l.id,
        articleId: l.article_id,
        reference: l.reference,
        designation: l.designation,
        prixUnitaire: l.prix_unitaire,
        quantite: l.quantite,
        tauxTva: l.taux_tva,
        remisePourcent: l.remise_pourcent,
        totalTtc: l.total_ttc,
        uniteVente: l.unite_vente ?? 'piece',
        facteurStock: l.facteur_stock ?? 1,
        piecesParCarton,
        quantiteStock: l.quantite * (l.facteur_stock ?? 1),
        quantiteRetournee,
        quantiteStockRetournee,
        quantiteRetourable: Math.max(0, l.quantite - quantiteRetournee),
        quantiteStockRetourable: Math.max(0, (l.quantite * (l.facteur_stock ?? 1)) - quantiteStockRetournee),
        totalRetourne,
        totalRetourable: Math.max(0, l.total_ttc - totalRetourne),
      };
    });
}

function enRetourClient(l) {
  if (!l) return null;
  return {
    id: l.id,
    numero: l.numero,
    dateRetour: l.date_retour,
    venteId: l.vente_id,
    venteNumero: l.vente_numero,
    clientId: l.client_id,
    clientNom: l.client_nom,
    creanceId: l.creance_id,
    utilisateurId: l.utilisateur_id,
    utilisateur: l.utilisateur,
    caisseId: l.caisse_id,
    referenceDocument: l.reference_document,
    modeRemboursement: l.mode_remboursement,
    totalTtc: l.total_ttc,
    montantDeduitCreance: l.montant_deduit_creance,
    montantRembourse: l.montant_rembourse,
    montantAvoir: l.montant_avoir,
    statut: l.statut,
    note: l.note,
    annuleLe: l.annule_le,
    motifAnnulation: l.motif_annulation,
  };
}

function enLigneRetourClient(l) {
  if (!l) return null;
  const piecesParCarton = l.article_pieces_par_carton ?? l.facteur_stock ?? 1;
  return {
    id: l.id,
    retourId: l.retour_id,
    ligneVenteId: l.ligne_vente_id,
    articleId: l.article_id,
    reference: l.reference,
    designation: l.designation,
    uniteRetour: l.unite_retour,
    facteurStock: l.facteur_stock,
    piecesParCarton,
    quantite: l.quantite,
    quantiteStock: l.quantite_stock,
    quantiteStockLibelle: conditionnement.decrireStock(l.quantite_stock, piecesParCarton),
    prixUnitaire: l.prix_unitaire,
    totalTtc: l.total_ttc,
  };
}

function sqlRetourClientBase() {
  return 'SELECT retours_clients.*, ventes.numero AS vente_numero, clients.nom AS client_nom, utilisateurs.nom AS utilisateur ' +
    'FROM retours_clients ' +
    'JOIN ventes ON ventes.id = retours_clients.vente_id ' +
    'LEFT JOIN clients ON clients.id = retours_clients.client_id ' +
    'LEFT JOIN utilisateurs ON utilisateurs.id = retours_clients.utilisateur_id ';
}

function lignesRetourClient(base, retourId) {
  return base.prepare(
    'SELECT lignes_retour_client.*, articles.pieces_par_carton AS article_pieces_par_carton ' +
      'FROM lignes_retour_client ' +
      'LEFT JOIN articles ON articles.id = lignes_retour_client.article_id ' +
      'WHERE retour_id = ? ORDER BY lignes_retour_client.id'
  ).all(retourId).map(enLigneRetourClient);
}

function lireRetour(base, id) {
  const retour = enRetourClient(base.prepare(sqlRetourClientBase() + 'WHERE retours_clients.id = ?').get(id));
  if (!retour) return null;
  return { ...retour, lignes: lignesRetourClient(base, retour.id) };
}

function retoursVente(base, venteId) {
  return base.prepare(
    sqlRetourClientBase() + 'WHERE retours_clients.vente_id = ? ORDER BY retours_clients.id DESC'
  ).all(venteId).map(enRetourClient).map((retour) => ({ ...retour, lignes: lignesRetourClient(base, retour.id) }));
}

function listerRetours(base, { venteId = null, clientId = null, limite = 100, inclureAnnules = true } = {}) {
  const conditions = [];
  const params = [];
  if (venteId) {
    conditions.push('retours_clients.vente_id = ?');
    params.push(venteId);
  }
  if (clientId) {
    conditions.push('retours_clients.client_id = ?');
    params.push(clientId);
  }
  if (!inclureAnnules) conditions.push("retours_clients.statut = 'valide'");
  const borne = Math.max(1, Math.min(300, Number(limite) || 100));
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' ' : '';
  return base.prepare(sqlRetourClientBase() + where + 'ORDER BY retours_clients.id DESC LIMIT ?')
    .all(...params, borne)
    .map(enRetourClient);
}

function preparerLignesRetour(vente, lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new RangeError('Un retour client doit contenir au moins une ligne.');
  }
  const cumuls = new Map();
  for (const ligne of lignes) {
    const ligneVenteId = Number(ligne.ligneVenteId ?? ligne.id);
    const quantite = Number(ligne.quantite);
    if (!Number.isInteger(ligneVenteId) || ligneVenteId <= 0) {
      throw new RangeError('Ligne de vente invalide dans le retour client.');
    }
    if (!Number.isInteger(quantite) || quantite < 0) {
      throw new RangeError('La quantite retour client doit etre un entier positif.');
    }
    if (quantite === 0) continue;
    cumuls.set(ligneVenteId, (cumuls.get(ligneVenteId) ?? 0) + quantite);
  }
  if (cumuls.size === 0) throw new RangeError('Indiquez au moins une quantite a retourner.');

  const preparees = [];
  for (const [ligneVenteId, quantite] of cumuls.entries()) {
    const originale = vente.panier.lignes.find((l) => l.id === ligneVenteId);
    if (!originale) throw new RangeError('La ligne retournee ne fait pas partie de cette vente.');
    if (!originale.articleId) throw new RangeError('Cette ligne ne peut pas etre retournee en stock.');
    if (quantite > originale.quantiteRetourable) {
      throw new RangeError(
        'Retour trop eleve pour ' + originale.designation +
          ' : reste ' + originale.quantiteRetourable + ' ' + conditionnement.libelleUnite(originale.uniteVente, originale.quantiteRetourable) +
          ' a retourner.'
      );
    }
    const retourCompletReste = quantite === originale.quantiteRetourable;
    const totalTtc = retourCompletReste
      ? originale.totalRetourable
      : Math.min(originale.totalRetourable, Math.round((originale.totalTtc * quantite) / originale.quantite));
    preparees.push({
      ...originale,
      quantite,
      quantiteStock: quantite * originale.facteurStock,
      totalTtc,
    });
  }
  return preparees;
}

function reduireCreancePourRetour(base, vente, totalRetour, numeroRetour) {
  const creance = base.prepare('SELECT * FROM creances_clients WHERE vente_id = ?').get(vente.id);
  if (!creance || totalRetour <= 0 || creance.solde <= 0 || !['ouverte', 'partielle'].includes(creance.statut)) {
    return { creanceId: creance?.id ?? null, deduit: 0, reste: totalRetour };
  }
  const deduit = Math.min(totalRetour, creance.solde);
  const nouveauSolde = creance.solde - deduit;
  const statut = nouveauSolde === 0 ? 'reglee' : 'partielle';
  base.prepare(
    "UPDATE creances_clients SET solde = ?, statut = ?, note = TRIM(COALESCE(note, '') || ?) WHERE id = ?"
  ).run(
    nouveauSolde,
    statut,
    ' Retour client ' + numeroRetour + ' deduit ' + formater(deduit) + '.',
    creance.id
  );
  return { creanceId: creance.id, deduit, reste: totalRetour - deduit };
}

function restaurerCreanceApresAnnulationRetour(base, retour) {
  if (!retour.creanceId || retour.montantDeduitCreance <= 0) return;
  const creance = clients.lireCreance(base, retour.creanceId);
  if (!creance) throw new RangeError('Creance client introuvable pour annuler le retour.');
  const nouveauSolde = creance.solde + retour.montantDeduitCreance;
  if (nouveauSolde > creance.montantInitial) {
    throw new RangeError('Annulation refusee : la creance client deviendrait superieure au montant initial.');
  }
  const statut = nouveauSolde === 0 ? 'reglee' : (nouveauSolde === creance.montantInitial ? 'ouverte' : 'partielle');
  base.prepare(
    "UPDATE creances_clients SET solde = ?, statut = ?, note = TRIM(COALESCE(note, '') || ?) WHERE id = ?"
  ).run(
    nouveauSolde,
    statut,
    ' Annulation retour client ' + retour.numero + ' +' + formater(retour.montantDeduitCreance) + '.',
    creance.id
  );
}

function lire(base, id) {
  const v = base
    .prepare(
      'SELECT ventes.*, utilisateurs.nom AS caissier, clients.nom AS client_nom, clients.code AS client_code, ' +
        'sessions_caisse.id AS session_id FROM ventes ' +
        'JOIN utilisateurs ON utilisateurs.id = ventes.utilisateur_id ' +
        'LEFT JOIN clients ON clients.id = ventes.client_id ' +
        'LEFT JOIN sessions_caisse ON sessions_caisse.id = ventes.caisse_id ' +
        'WHERE ventes.id = ?'
    )
    .get(id);
  if (!v) return null;
  const lignes = lignesVente(base, id);
  const retours = retoursVente(base, id);
  const retoursValides = retours.filter((r) => r.statut === 'valide');
  const totalRetours = retoursValides.reduce((s, r) => s + r.totalTtc, 0);
  const montantAvoirRetour = retoursValides.reduce((s, r) => s + r.montantAvoir, 0);
  const montantRembourseRetour = retoursValides.reduce((s, r) => s + r.montantRembourse, 0);
  const montantDeduitCreanceRetour = retoursValides.reduce((s, r) => s + r.montantDeduitCreance, 0);
  const facturesCredit = v.paiement_credit ? facturesCreditClient(base, v.client_id) : [];
  return {
    id: v.id,
    numero: v.numero,
    date: v.date_vente,
    caissier: v.caissier,
    annulee: Boolean(v.annulee),
    motifAnnulation: v.motif_annulation,
    client: v.client_id ? { id: v.client_id, code: v.client_code, nom: v.client_nom } : null,
    creditClient: facturesCredit.length > 0
      ? { factures: facturesCredit, totalSolde: facturesCredit.reduce((s, f) => s + f.solde, 0) }
      : null,
    caisseId: v.session_id,
    paiement: {
      mode: v.paiement_credit ? 'credit' : v.mode_paiement,
      montantRecu: v.montant_recu,
      rendu: v.monnaie_rendue,
    },
    totalRetours,
    montantNet: Math.max(0, v.total_ttc - totalRetours),
    montantAvoirRetour,
    montantRembourseRetour,
    montantDeduitCreanceRetour,
    retours,
    panier: {
      lignes,
      totalBrut: v.total_brut,
      remise: v.remise,
      totalTtc: v.total_ttc,
      totalHt: v.total_ht,
      totalTva: v.total_tva,
      nombreArticles: lignes.reduce((s, l) => s + l.quantite, 0),
      nombrePiecesStock: lignes.reduce((s, l) => s + l.quantiteStock, 0),
      ventilation: ventiler(lignes),
    },
  };
}


function retourner(base, donnees) {
  return base.transaction(() => {
    const vente = lire(base, donnees.venteId);
    if (!vente) throw new RangeError('Vente introuvable.');
    if (vente.annulee) throw new RangeError('Impossible de retourner un article sur une vente annulee.');
    const lignes = preparerLignesRetour(vente, donnees.lignes);
    const total = lignes.reduce((s, l) => s + l.totalTtc, 0);
    if (total <= 0) throw new RangeError('Le montant du retour client doit etre superieur a zero.');

    const date = donnees.dateRetour || horodater();
    const numero = donnees.numero || numeroRetourClientSuivant(base, date);
    const referenceDocument = String(donnees.referenceDocument ?? donnees.reference ?? '').trim() || null;
    const note = String(donnees.note ?? '').trim() || null;
    const finance = reduireCreancePourRetour(base, vente, total, numero);
    const mode = modeRemboursementRetour(donnees.modeRemboursement ?? donnees.modePaiement ?? 'avoir');
    let session = null;
    let montantRembourse = 0;
    let montantAvoir = 0;
    if (finance.reste > 0) {
      if (mode === 'avoir') {
        montantAvoir = finance.reste;
      } else {
        session = caisse.exigerOuverte(base);
        montantRembourse = finance.reste;
      }
    }

    const ins = base.prepare(
      'INSERT INTO retours_clients (numero, date_retour, vente_id, client_id, creance_id, utilisateur_id, caisse_id, ' +
        'reference_document, mode_remboursement, total_ttc, montant_deduit_creance, montant_rembourse, ' +
        'montant_avoir, statut, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'valide\', ?)'
    ).run(
      numero,
      date,
      vente.id,
      vente.client?.id ?? null,
      finance.creanceId,
      donnees.utilisateurId ?? null,
      session?.id ?? null,
      referenceDocument,
      mode,
      total,
      finance.deduit,
      montantRembourse,
      montantAvoir,
      note
    );
    const retourId = ins.lastInsertRowid;

    const insererLigne = base.prepare(
      'INSERT INTO lignes_retour_client (retour_id, ligne_vente_id, article_id, reference, designation, unite_retour, ' +
        'facteur_stock, quantite, quantite_stock, prix_unitaire, total_ttc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const ligne of lignes) {
      insererLigne.run(
        retourId,
        ligne.id,
        ligne.articleId,
        ligne.reference,
        ligne.designation,
        ligne.uniteVente,
        ligne.facteurStock,
        ligne.quantite,
        ligne.quantiteStock,
        ligne.prixUnitaire,
        ligne.totalTtc
      );
      stocks.mouvement(base, {
        articleId: ligne.articleId,
        type: 'retour',
        unite: ligne.uniteVente,
        quantite: ligne.quantite,
        motif: 'Retour client ' + numero + ' - vente ' + vente.numero,
        reference: referenceDocument || numero,
        venteId: vente.id,
        retourClientId: retourId,
        utilisateurId: donnees.utilisateurId,
      });
    }

    return lireRetour(base, retourId);
  })();
}

function annulerRetour(base, id, motif = '', utilisateurId = null) {
  return base.transaction(() => {
    const retour = lireRetour(base, id);
    if (!retour) throw new RangeError('Retour client introuvable.');
    if (retour.statut === 'annule') throw new RangeError('Ce retour client est deja annule.');
    const raison = String(motif ?? '').trim() || 'Annulation retour client ' + retour.numero;

    for (const ligne of retour.lignes) {
      stocks.mouvement(base, {
        articleId: ligne.articleId,
        type: 'sortie',
        unite: ligne.uniteRetour,
        quantite: ligne.quantite,
        motif: 'Annulation retour client ' + retour.numero + ' - ' + raison,
        reference: retour.referenceDocument || retour.numero,
        venteId: retour.venteId,
        retourClientId: retour.id,
        utilisateurId,
      });
    }
    restaurerCreanceApresAnnulationRetour(base, retour);
    base.prepare("UPDATE retours_clients SET statut = 'annule', annule_le = ?, motif_annulation = ? WHERE id = ?")
      .run(horodater(), raison, retour.id);
    return lireRetour(base, retour.id);
  })();
}

function ventiler(lignes) {
  const parTaux = new Map();
  for (const l of lignes) parTaux.set(l.tauxTva, (parTaux.get(l.tauxTva) ?? 0) + l.totalTtc);
  return [...parTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, ttc]) => {
      const base = Math.round(ttc / (1 + taux / 100));
      return { taux, base, tva: ttc - base, ttc };
    });
}

/** Ventes d'une journee, la plus recente en tete. */
function journal(base, jour) {
  return base
    .prepare(
      'SELECT ventes.id, numero, date_vente, total_ttc, ' +
        "COALESCE((SELECT SUM(total_ttc) FROM retours_clients WHERE vente_id = ventes.id AND statut = 'valide'), 0) AS total_retours, " +
        'CASE WHEN paiement_credit = 1 THEN \'credit\' ELSE mode_paiement END AS mode_paiement, ' +
        'annulee, utilisateurs.nom AS caissier, clients.nom AS client_nom FROM ventes ' +
        'JOIN utilisateurs ON utilisateurs.id = ventes.utilisateur_id ' +
        'LEFT JOIN clients ON clients.id = ventes.client_id ' +
        'WHERE date(date_vente) = ? ORDER BY ventes.id DESC'
    )
    .all(jour)
    .map((v) => ({
      id: v.id,
      numero: v.numero,
      date: v.date_vente,
      totalTtc: v.total_ttc,
      totalRetours: v.total_retours ?? 0,
      montantNet: Math.max(0, v.total_ttc - (v.total_retours ?? 0)),
      modePaiement: v.mode_paiement,
      annulee: Boolean(v.annulee),
      caissier: v.caissier,
      clientNom: v.client_nom,
    }));
}

/** Cloture de caisse : le total du jour, ventile par mode de paiement et par taux. */
function cloture(base, jour) {
  const totaux = base
    .prepare(
      'SELECT COUNT(*) AS nombre, COALESCE(SUM(total_ttc), 0) AS ttc, ' +
        'COALESCE(SUM(total_ht), 0) AS ht, COALESCE(SUM(total_tva), 0) AS tva, ' +
        'COALESCE(SUM(remise), 0) AS remise FROM ventes ' +
        'WHERE date(date_vente) = ? AND annulee = 0'
    )
    .get(jour);

  const encaissement = base
    .prepare(
      'SELECT COALESCE(SUM(CASE WHEN paiement_credit = 1 THEN total_ttc ELSE 0 END), 0) AS credit, ' +
        'COALESCE(SUM(CASE WHEN paiement_credit = 0 THEN total_ttc ELSE 0 END), 0) AS encaisse FROM ventes ' +
        'WHERE date(date_vente) = ? AND annulee = 0'
    )
    .get(jour);

  const parPaiement = base
    .prepare(
      'SELECT CASE WHEN paiement_credit = 1 THEN \'credit\' ELSE mode_paiement END AS mode, ' +
        'COUNT(*) AS nombre, SUM(total_ttc) AS ttc FROM ventes ' +
        'WHERE date(date_vente) = ? AND annulee = 0 GROUP BY mode'
    )
    .all(jour);

  const retours = base
    .prepare(
      'SELECT COUNT(*) AS nombre, COALESCE(SUM(total_ttc), 0) AS total, ' +
        'COALESCE(SUM(montant_deduit_creance), 0) AS deduitCreance, ' +
        'COALESCE(SUM(montant_rembourse), 0) AS rembourse, ' +
        'COALESCE(SUM(montant_avoir), 0) AS avoir FROM retours_clients ' +
        "WHERE date(date_retour) = ? AND statut = 'valide'"
    )
    .get(jour);

  const parTaux = base
    .prepare(
      'SELECT taux_tva AS taux, SUM(lignes_vente.total_ttc) AS ttc FROM lignes_vente ' +
        'JOIN ventes ON ventes.id = lignes_vente.vente_id ' +
        'WHERE date(ventes.date_vente) = ? AND ventes.annulee = 0 ' +
        'GROUP BY taux_tva ORDER BY taux_tva DESC'
    )
    .all(jour)
    .map((r) => {
      const base_ht = Math.round(r.ttc / (1 + r.taux / 100));
      return { taux: r.taux, base: base_ht, tva: r.ttc - base_ht, ttc: r.ttc };
    });

  const annulees = base
    .prepare('SELECT COUNT(*) AS n FROM ventes WHERE date(date_vente) = ? AND annulee = 1')
    .get(jour).n;

  return {
    jour,
    nombreVentes: totaux.nombre,
    totalTtc: totaux.ttc,
    totalRetoursClients: retours.total,
    nombreRetoursClients: retours.nombre,
    chiffreAffairesNet: Math.max(0, totaux.ttc - retours.total),
    totalEncaisse: encaissement.encaisse,
    totalEncaisseNet: Math.max(0, encaissement.encaisse - retours.rembourse),
    totalCredit: encaissement.credit,
    totalRetoursDeduitsCreances: retours.deduitCreance,
    totalRetoursRembourses: retours.rembourse,
    totalAvoirsClients: retours.avoir,
    totalHt: totaux.ht,
    totalTva: totaux.tva,
    remise: totaux.remise,
    parPaiement,
    parTaux,
    ventesAnnulees: annulees,
  };
}

/** Annule une vente et remet le stock en rayon. Reserve a l'administrateur. */
function annuler(base, id, motif, utilisateurId = null) {
  return base.transaction(() => {
    const vente = base.prepare('SELECT * FROM ventes WHERE id = ?').get(id);
    if (!vente) throw new RangeError('Vente introuvable.');
    if (vente.annulee) throw new RangeError('Cette vente est deja annulee.');
    const retours = base.prepare("SELECT COUNT(*) AS n FROM retours_clients WHERE vente_id = ? AND statut = 'valide'").get(id).n;
    if (retours > 0) {
      throw new RangeError('Cette vente a deja un retour client. Annulez le retour avant d annuler toute la vente.');
    }

    for (const l of base.prepare('SELECT * FROM lignes_vente WHERE vente_id = ?').all(id)) {
      if (l.article_id !== null) {
        stocks.mouvement(base, {
          articleId: l.article_id,
          type: 'retour',
          unite: l.unite_vente ?? 'piece',
          quantite: l.quantite,
          motif: 'Annulation vente ' + vente.numero,
          venteId: id,
          utilisateurId,
        });
      }
    }
    base
      .prepare(
        "UPDATE creances_clients SET solde = 0, statut = 'annulee', " +
          "note = TRIM(COALESCE(note, '') || ' Annulee avec la vente ' || ?) WHERE vente_id = ?"
      )
      .run(vente.numero, id);

    base
      .prepare('UPDATE ventes SET annulee = 1, annulee_le = ?, motif_annulation = ? WHERE id = ?')
      .run(horodater(), String(motif ?? '').trim() || null, id);
    return lire(base, id);
  })();
}

module.exports = {
  enregistrer,
  lire,
  journal,
  cloture,
  annuler,
  retourner,
  lireRetour,
  listerRetours,
  annulerRetour,
  numeroSuivant,
};

'use strict';

const { calculer } = require('../metier/panier');
const { horodater, jourDe } = require('../metier/horodatage');
const { arrondirEspeces, rendreMonnaie } = require('../metier/monnaie');
const articles = require('./articles');
const clients = require('./clients');
const caisse = require('./caisse');
const stocks = require('./stocks');

function numeroSuivant(base, horodatage) {
  const jour = jourDe(horodatage).replace(/-/g, '');
  const derniere = base
    .prepare("SELECT numero FROM ventes WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1")
    .get('V-' + jour + '-%');
  const rang = derniere ? Number(derniere.numero.split('-')[2]) + 1 : 1;
  return 'V-' + jour + '-' + String(rang).padStart(4, '0');
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
      if (article.stock < l.quantite) {
        throw new RangeError(
          'Stock insuffisant pour ' + article.designation +
            ' : ' + article.stock + ' en rayon, ' + l.quantite + ' demandes.'
        );
      }
      return {
        articleId: article.id,
        reference: article.reference,
        designation: article.designation,
        prixUnitaire: article.prixUnitaire,
        tauxTva: article.tauxTva,
        quantite: l.quantite,
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
      'INSERT INTO lignes_vente (vente_id, article_id, reference, designation, ' +
        'prix_unitaire, quantite, taux_tva, remise_pourcent, total_ttc) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    panier.lignes.forEach((l, i) => {
      const source = lignesVerifiees[i];
      poserLigne.run(vente.lastInsertRowid, source.articleId, l.reference, l.designation,
        l.prixUnitaire, l.quantite, l.tauxTva, l.remisePourcent, l.totalTtc);
      stocks.mouvement(base, {
        articleId: source.articleId,
        type: 'sortie',
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
  const lignes = base
    .prepare('SELECT * FROM lignes_vente WHERE vente_id = ? ORDER BY id')
    .all(id)
    .map((l) => ({
      reference: l.reference,
      designation: l.designation,
      prixUnitaire: l.prix_unitaire,
      quantite: l.quantite,
      tauxTva: l.taux_tva,
      remisePourcent: l.remise_pourcent,
      totalTtc: l.total_ttc,
    }));
  return {
    id: v.id,
    numero: v.numero,
    date: v.date_vente,
    caissier: v.caissier,
    annulee: Boolean(v.annulee),
    motifAnnulation: v.motif_annulation,
    client: v.client_id ? { id: v.client_id, code: v.client_code, nom: v.client_nom } : null,
    caisseId: v.session_id,
    paiement: {
      mode: v.paiement_credit ? 'credit' : v.mode_paiement,
      montantRecu: v.montant_recu,
      rendu: v.monnaie_rendue,
    },
    panier: {
      lignes,
      totalBrut: v.total_brut,
      remise: v.remise,
      totalTtc: v.total_ttc,
      totalHt: v.total_ht,
      totalTva: v.total_tva,
      nombreArticles: lignes.reduce((s, l) => s + l.quantite, 0),
      ventilation: ventiler(lignes),
    },
  };
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
    totalEncaisse: encaissement.encaisse,
    totalCredit: encaissement.credit,
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

    for (const l of base.prepare('SELECT * FROM lignes_vente WHERE vente_id = ?').all(id)) {
      if (l.article_id !== null) {
        stocks.mouvement(base, {
          articleId: l.article_id,
          type: 'retour',
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

module.exports = { enregistrer, lire, journal, cloture, annuler, numeroSuivant };

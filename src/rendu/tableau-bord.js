'use strict';

const TableauBord = {
  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    actions.append(
      creer('button', { classe: 'bouton discret', texte: 'Actualiser', sur: { click: () => this.charger() } }),
      creer('button', { classe: 'bouton espace-gauche', texte: 'Aller a la vente', sur: { click: () => ouvrirVue('vente') } })
    );
    await this.charger();
  },

  async charger() {
    const donnees = await appeler(window.caisse.tableauDeBord.lire());
    this.afficher(donnees);
  },

  afficher(d) {
    const zone = $('#contenu-tableau-bord');
    vider(zone);
    const pourcentage = (valeur) =>
      new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Number(valeur) || 0) + ' %';

    const carte = (titre, valeur, detail, classe = '', icone = '•') => creer('div', { classe: 'carte-indicateur carte-tableau ' + classe }, [
      creer('div', { classe: 'carte-tableau-entete' }, [
        creer('span', { classe: 'libelle-doux', texte: titre }),
        creer('span', { classe: 'icone-carte', texte: icone }),
      ]),
      creer('strong', { texte: valeur }),
      creer('small', { texte: detail ?? '' }),
    ]);

    const etatCaisse = d.caisse.ouverte ? 'Ouverte' : 'Fermee';
    const detailCaisse = d.caisse.ouverte
      ? 'Fond ' + formater(d.caisse.session.fondOuverture) + ' - theorique ' + formater(d.caisse.resume.totalTheorique)
      : 'Ouvrir avant les encaissements';

    const proprietaire = d.proprietaire ?? { mois: {}, stock: {} };
    zone.append(creer('div', { classe: 'grille-indicateurs grille-tableau-bord' }, [
      carte('Caisse', etatCaisse, detailCaisse, d.caisse.ouverte ? 'succes carte-caisse' : 'alerte carte-caisse', '₣'),
      carte('Ventes du jour', formater(d.ventes.total), d.ventes.nombre + ' ticket(s)', 'carte-ventes', 'V'),
      carte('Marge du jour', formater(d.rentabilite?.margeNette ?? 0),
        'Taux ' + pourcentage(d.rentabilite?.tauxMarge ?? 0),
        (d.rentabilite?.margeNette ?? 0) < 0 ? 'alerte carte-marge' : 'carte-marge', 'M'),
      carte('Encaisse', formater(d.ventes.encaisse), 'Hors ventes a credit', 'carte-encaisse', 'E'),
      carte('Ventes du mois', formater(proprietaire.mois?.ventes ?? 0),
        (proprietaire.mois?.tickets ?? 0) + ' ticket(s) depuis le 1er', 'carte-mois', 'Σ'),
      carte('Benefice du mois', formater(proprietaire.mois?.margeNette ?? 0),
        'Taux ' + pourcentage(proprietaire.mois?.tauxMarge ?? 0),
        (proprietaire.mois?.margeNette ?? 0) < 0 ? 'alerte carte-marge' : 'carte-marge', 'B'),
      carte('Valeur achat stock', formater(proprietaire.stock?.valeurAchat ?? 0),
        (proprietaire.stock?.unitesStock ?? 0) + ' piece(s) en stock', 'carte-stock-valeur', '▣'),
      carte('Net credits', formater(proprietaire.netCredits ?? 0),
        'Clients - fournisseurs', (proprietaire.netCredits ?? 0) < 0 ? 'warning carte-net' : 'carte-net', 'N'),
      carte('Achats du jour', formater(d.achats?.total ?? 0), (d.achats?.nombre ?? 0) + ' reception(s)', 'carte-achats', 'A'),
      carte('Credit clients', formater(d.clients.solde), d.clients.nombre + ' creance(s)', 'carte-credit', 'C'),
      carte('A payer fournisseurs', formater(d.fournisseurs.solde), d.fournisseurs.nombre + ' dette(s)', 'carte-dettes', 'F'),
      carte('Stock en alerte', String(d.stock.alertes.length), d.stock.rupture + ' rupture(s)', d.stock.alertes.length ? 'warning carte-stock' : 'carte-stock', 'S'),
    ]));

    const panneaux = creer('div', { classe: 'deux-colonnes tableau-bord-panneaux panneaux-tableau-bord' });
    const syntheseProprietaire = creer('div', { classe: 'panneau panneau-dashboard panneau-proprietaire' }, [
      creer('h3', { texte: 'Synthese proprietaire' }),
      creer('div', { classe: 'ligne-cloture' }, [
        creer('span', { texte: 'CA mois courant' }),
        creer('span', { classe: 'montant', texte: formater(proprietaire.mois?.ventes ?? 0) }),
      ]),
      creer('div', { classe: 'ligne-cloture' }, [
        creer('span', { texte: 'Benefice mois courant' }),
        creer('span', { classe: 'montant', texte: formater(proprietaire.mois?.margeNette ?? 0) }),
      ]),
      creer('div', { classe: 'ligne-cloture' }, [
        creer('span', { texte: 'Stock au prix de vente' }),
        creer('span', { classe: 'montant', texte: formater(proprietaire.stock?.valeurVente ?? 0) }),
      ]),
      creer('div', { classe: 'ligne-cloture' }, [
        creer('span', { texte: 'Marge potentielle stock' }),
        creer('span', { classe: 'montant', texte: formater(proprietaire.stock?.margePotentielle ?? 0) }),
      ]),
    ]);

    const ventes = creer('div', { classe: 'panneau panneau-dashboard' }, [creer('h3', { texte: 'Ventes par mode' })]);
    if (d.ventes.parMode.length === 0) ventes.append(creer('p', { classe: 'vide compacte', texte: 'Aucune vente aujourd hui.' }));
    for (const p of d.ventes.parMode) {
      ventes.append(creer('div', { classe: 'ligne-cloture' }, [
        creer('span', { texte: LIBELLES_PAIEMENT[p.mode] + ' (' + p.nombre + ')' }),
        creer('span', { classe: 'montant', texte: formater(p.total) }),
      ]));
    }

    const stock = creer('div', { classe: 'panneau panneau-dashboard' }, [creer('h3', { texte: 'Articles a surveiller' })]);
    if (d.stock.alertes.length === 0) stock.append(creer('p', { classe: 'vide compacte', texte: 'Aucune alerte de stock.' }));
    for (const a of d.stock.alertes) {
      stock.append(creer('div', { classe: 'ligne-cloture' }, [
        creer('span', { texte: a.designation + ' (' + a.reference + ')' }),
        creer('span', { classe: 'montant', texte: a.stock + ' / seuil ' + a.seuilAlerte }),
      ]));
    }

    const top = creer('div', { classe: 'panneau panneau-dashboard' }, [creer('h3', { texte: 'Meilleures sorties du jour' })]);
    if (d.topArticles.length === 0) top.append(creer('p', { classe: 'vide compacte', texte: 'Pas encore de ventes.' }));
    for (const a of d.topArticles) {
      top.append(creer('div', { classe: 'ligne-cloture' }, [
        creer('span', { texte: a.designation + ' x ' + a.quantite }),
        creer('span', { classe: 'montant', texte: formater(a.total) }),
      ]));
    }

    panneaux.append(syntheseProprietaire, ventes, stock, top);
    zone.append(panneaux);
  },
};

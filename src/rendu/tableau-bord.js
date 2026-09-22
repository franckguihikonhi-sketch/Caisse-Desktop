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

    zone.append(creer('div', { classe: 'grille-indicateurs grille-tableau-bord' }, [
      carte('Caisse', etatCaisse, detailCaisse, d.caisse.ouverte ? 'succes carte-caisse' : 'alerte carte-caisse', '₣'),
      carte('Ventes du jour', formater(d.ventes.total), d.ventes.nombre + ' ticket(s)', 'carte-ventes', 'V'),
      carte('Encaisse', formater(d.ventes.encaisse), 'Hors ventes a credit', 'carte-encaisse', 'E'),
      carte('Achats du jour', formater(d.achats?.total ?? 0), (d.achats?.nombre ?? 0) + ' reception(s)', 'carte-achats', 'A'),
      carte('Credit clients', formater(d.clients.solde), d.clients.nombre + ' creance(s)', 'carte-credit', 'C'),
      carte('A payer fournisseurs', formater(d.fournisseurs.solde), d.fournisseurs.nombre + ' dette(s)', 'carte-dettes', 'F'),
      carte('Stock en alerte', String(d.stock.alertes.length), d.stock.rupture + ' rupture(s)', d.stock.alertes.length ? 'warning carte-stock' : 'carte-stock', 'S'),
    ]));

    const panneaux = creer('div', { classe: 'deux-colonnes tableau-bord-panneaux panneaux-tableau-bord' });
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

    panneaux.append(ventes, stock, top);
    zone.append(panneaux);
  },
};

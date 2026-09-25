'use strict';

const Stock = {
  articles: [],
  recherche: '',
  filtre: 'tous',

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    actions.append(
      creer('button', { classe: 'bouton discret', texte: 'Actualiser', sur: { click: () => this.charger() } })
    );
    if (App.peut('articles:gerer')) {
      actions.append(creer('button', {
        classe: 'bouton espace-gauche', texte: 'Nouvel article', sur: { click: () => this.nouvelArticle() },
      }));
    }
    await this.charger();
  },

  async charger() {
    this.articles = await appeler(window.caisse.articles.lister());
    this.afficher();
  },

  async nouvelArticle() {
    if (!App.peut('articles:gerer')) {
      return annoncer('Votre role ne permet pas de creer un article.', 'avertissement');
    }
    const cree = await Articles.editer(null);
    if (cree) await this.charger();
  },

  statut(article) {
    if (article.stock <= 0) return 'rupture';
    if (article.seuilAlerte > 0 && article.stock <= article.seuilAlerte) return 'alerte';
    return 'ok';
  },

  libelleStatut(statut) {
    return { ok: 'Stock OK', alerte: 'Stock bas', rupture: 'Rupture' }[statut] ?? statut;
  },

  niveauStock(article) {
    const statut = this.statut(article);
    if (statut === 'rupture') return 'rupture';
    if (statut === 'alerte') return 'alerte';
    if (article.seuilAlerte > 0 && article.stock <= article.seuilAlerte * 2) return 'moyen';
    return 'bon';
  },

  articlesFiltres() {
    const texte = this.recherche.trim().toLowerCase();
    return this.articles.filter((article) => {
      const statut = this.statut(article);
      if (this.filtre !== 'tous' && statut !== this.filtre) return false;
      if (!texte) return true;
      return [article.reference, article.designation, article.codeBarres, article.codeBarresCarton]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(texte));
    });
  },

  afficher() {
    const zone = $('#contenu-stock');
    vider(zone);

    const totalArticles = this.articles.length;
    const ruptures = this.articles.filter((a) => this.statut(a) === 'rupture').length;
    const alertes = this.articles.filter((a) => this.statut(a) === 'alerte').length;
    const pieces = this.articles.reduce((s, a) => s + a.stock, 0);

    zone.append(creer('div', { classe: 'stock-resume' }, [
      this.carte('Articles suivis', String(totalArticles), 'catalogue actif', ''),
      this.carte('Pieces en stock', String(pieces), 'unite canonique', ''),
      this.carte('Alertes', String(alertes), 'stock <= seuil', alertes ? 'warning' : 'succes'),
      this.carte('Ruptures', String(ruptures), 'stock nul', ruptures ? 'alerte' : 'succes'),
    ]));

    const recherche = creer('input', {
      attributs: {
        type: 'search',
        placeholder: 'Rechercher par designation, reference ou code-barres',
        value: this.recherche,
        autocomplete: 'off',
      },
      sur: { input: (e) => { this.recherche = e.target.value; this.rafraichirTableStock(); } },
    });
    const filtres = creer('div', { classe: 'filtres-stock' });
    for (const [cle, libelle] of [['tous', 'Tous'], ['ok', 'OK'], ['alerte', 'Alertes'], ['rupture', 'Ruptures']]) {
      filtres.append(creer('button', {
        classe: 'bouton discret' + (this.filtre === cle ? ' actif' : ''),
        texte: libelle,
        sur: { click: () => { this.filtre = cle; this.afficher(); } },
      }));
    }
    zone.append(creer('div', { classe: 'stock-outils panneau' }, [
      creer('label', { texte: 'Recherche stock' }, [recherche]),
      filtres,
    ]));

    const tableau = creer('div', { classe: 'panneau stock-tableau' });
    tableau.append(creer('h3', { texte: 'Stock restant par article' }), this.tableauStock());
    zone.append(creer('div', { classe: 'stock-grille' }, [tableau]));
  },

  rafraichirTableStock() {
    const panneau = $('.stock-tableau');
    if (!panneau) return;
    vider(panneau);
    panneau.append(creer('h3', { texte: 'Stock restant par article' }), this.tableauStock());
  },

  carte(titre, valeur, detail, classe) {
    return creer('div', { classe: 'carte-indicateur ' + classe }, [
      creer('span', { classe: 'libelle-doux', texte: titre }),
      creer('strong', { texte: valeur }),
      creer('small', { texte: detail }),
    ]);
  },

  tableauStock() {
    const articles = this.articlesFiltres();
    const table = creer('table', { classe: 'table-stock' }, [
      creer('thead', {}, [
        creer('tr', {}, [
          creer('th', { texte: 'Reference' }),
          creer('th', { texte: 'Article' }),
          creer('th', { texte: 'Conditionnement' }),
          creer('th', { classe: 'nombre', texte: 'Stock restant' }),
          creer('th', { classe: 'nombre', texte: 'Seuil' }),
          creer('th', { texte: 'Etat' }),
          creer('th', { texte: '' }),
        ]),
      ]),
    ]);
    const corps = creer('tbody');
    if (articles.length === 0) {
      corps.append(creer('tr', {}, [
        creer('td', { classe: 'vide', texte: 'Aucun article ne correspond au filtre.', attributs: { colspan: '7' } }),
      ]));
    }
    for (const article of articles) {
      const statut = this.statut(article);
      const niveau = this.niveauStock(article);
      corps.append(creer('tr', { classe: 'ligne-stock ' + statut }, [
        creer('td', { texte: article.reference }),
        creer('td', {}, [
          creer('strong', { texte: article.designation }),
          creer('div', { classe: 'detail-stock', texte: [article.codeBarres ? 'P ' + article.codeBarres : null, article.codeBarresCarton ? 'C ' + article.codeBarresCarton : null].filter(Boolean).join(' / ') }),
        ]),
        creer('td', { texte: article.conditionnement ?? ('1 carton = ' + piecesParCarton(article) + ' pieces') }),
        creer('td', { classe: 'nombre montant stock-restant', texte: article.stockLibelle ?? formaterStock(article.stock, article) }),
        creer('td', { classe: 'nombre', texte: article.seuilAlerte > 0 ? formaterStock(article.seuilAlerte, article) : '-' }),
        creer('td', {}, [
          creer('span', { classe: 'badge-stock ' + statut, texte: this.libelleStatut(statut) }),
          creer('div', { classe: 'jauge-stock ' + niveau }, [creer('span')]),
        ]),
        creer('td', { classe: 'nombre' }, [
          creer('button', { classe: 'bouton discret', texte: 'Mouvements', sur: { click: () => this.details(article) } }),
        ]),
      ]));
    }
    table.append(corps);
    return table;
  },


  async details(article) {
    const mouvements = await appeler(window.caisse.stock.lister({ articleId: article.id, limite: 80 }));
    await ouvrirBoite((fermer) => {
      const liste = creer('div', { classe: 'liste-mouvements-stock details-stock' });
      if (mouvements.length === 0) liste.append(creer('p', { classe: 'vide compacte', texte: 'Aucun mouvement pour cet article.' }));
      for (const m of mouvements) {
        const positif = m.quantite > 0;
        liste.append(creer('div', { classe: 'mouvement-stock ' + (positif ? 'entree' : 'sortie') }, [
          creer('div', {}, [
            creer('strong', { texte: this.dateCourte(m.date) + ' — ' + m.motif }),
            creer('span', { texte: 'Avant ' + m.stockAvantLibelle + ' -> apres ' + m.stockApresLibelle + (m.fournisseur ? ' — ' + m.fournisseur : '') }),
          ]),
          creer('b', { texte: (positif ? '+' : '-') + m.quantiteLibelle }),
        ]));
      }
      return creer('div', {}, [
        creer('h3', { texte: 'Stock - ' + article.designation }),
        creer('p', { classe: 'aide', texte: 'Stock restant : ' + (article.stockLibelle ?? formaterStock(article.stock, article)) }),
        liste,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ]);
    });
  },

  dateCourte(date) {
    return String(date ?? '').slice(0, 16).replace('T', ' ');
  },
};

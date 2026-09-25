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
    if (App.peut('inventaire:gerer')) {
      actions.append(creer('button', {
        classe: 'bouton discret espace-gauche', texte: 'Inventaire physique', sur: { click: () => this.inventairePhysique() },
      }));
    }
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

  async inventairePhysique() {
    if (!App.peut('inventaire:gerer')) {
      return annoncer('Votre role ne permet pas de valider un inventaire.', 'avertissement');
    }
    const articlesInventaire = await appeler(window.caisse.inventaires.preparer());
    if (articlesInventaire.length === 0) {
      return annoncer('Aucun article actif a inventorier.', 'avertissement');
    }

    const resultat = await ouvrirBoite((fermer) => {
      const recherche = creer('input', { attributs: { type: 'search', placeholder: 'Filtrer les articles a compter', autocomplete: 'off' } });
      const note = creer('input', { attributs: { type: 'text', placeholder: 'Note inventaire, rayon, equipe...' } });
      const lignesZone = creer('div', { classe: 'liste-inventaire' });
      const message = creer('p', { classe: 'message' });
      const champs = new Map();

      const dessiner = () => {
        vider(lignesZone);
        const texte = recherche.value.trim().toLowerCase();
        const filtres = articlesInventaire.filter((a) => !texte ||
          [a.reference, a.designation].join(' ').toLowerCase().includes(texte));
        if (filtres.length === 0) {
          lignesZone.append(creer('p', { classe: 'vide compacte', texte: 'Aucun article ne correspond au filtre.' }));
          return;
        }
        for (const article of filtres) {
          let champ = champs.get(article.articleId);
          if (!champ) {
            champ = creer('input', {
              attributs: {
                type: 'number', min: '0', step: '1', value: String(article.stockTheorique),
                'data-article-id': String(article.articleId),
              },
            });
            champs.set(article.articleId, champ);
          }
          lignesZone.append(creer('div', { classe: 'ligne-inventaire' }, [
            creer('div', {}, [
              creer('strong', { texte: article.designation }),
              creer('span', { classe: 'aide', texte: article.reference + ' — theorique ' + article.stockTheoriqueLibelle }),
            ]),
            creer('label', { texte: 'Compte physique (pieces)' }, [champ]),
          ]));
        }
      };

      const valider = async () => {
        const lignes = articlesInventaire.map((article) => ({
          articleId: article.articleId,
          stockCompte: Number(champs.get(article.articleId)?.value ?? article.stockTheorique),
        }));
        try {
          fermer(await appeler(window.caisse.inventaires.enregistrer({ lignes, note: note.value })));
        } catch (erreur) {
          afficherMessage(message, erreur.message);
        }
      };

      recherche.addEventListener('input', dessiner);
      dessiner();
      return creer('div', { classe: 'inventaire-boite' }, [
        creer('h3', { texte: 'Inventaire physique' }),
        creer('p', { classe: 'aide', texte: 'Saisissez le stock reel compte en pieces. Les ecarts appliqueront automatiquement des corrections journalisees.' }),
        message,
        recherche,
        note,
        lignesZone,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Valider et corriger le stock', sur: { click: valider } }),
        ]),
      ]);
    });

    if (resultat) {
      await this.charger();
      await ouvrirBoite((fermer) => creer('div', {}, [
        creer('h3', { texte: 'Inventaire applique' }),
        creer('p', { texte: resultat.numero + ' — ' + resultat.totalLignes + ' article(s) comptes.' }),
        creer('p', { classe: 'aide', texte: resultat.totalEcarts + ' piece(s) d ecart corrigees et tracees dans le stock.' }),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ]));
    }
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

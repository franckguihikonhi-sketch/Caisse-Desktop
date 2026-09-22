'use strict';

const Achats = {
  achats: [],
  fournisseurs: [],
  articles: [],

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    actions.append(
      creer('button', { classe: 'bouton', texte: 'Nouvel achat', sur: { click: () => this.nouveau() } }),
      creer('button', { classe: 'bouton discret espace-gauche', texte: 'Nouveau fournisseur', sur: { click: () => this.nouveauFournisseur() } }),
      creer('button', { classe: 'bouton discret espace-gauche', texte: 'Nouvel article', sur: { click: () => this.nouvelArticle() } }),
      creer('button', { classe: 'bouton discret espace-gauche', texte: 'Actualiser', sur: { click: () => this.charger() } })
    );
    await this.charger();
  },

  async charger() {
    const [achats, fournisseurs, articles] = await Promise.all([
      appeler(window.caisse.achats.lister({ limite: 120 })),
      appeler(window.caisse.fournisseurs.lister()),
      appeler(window.caisse.articles.lister()),
    ]);
    this.achats = achats;
    this.fournisseurs = fournisseurs;
    this.articles = articles;
    this.afficher();
  },

  afficher() {
    this.afficherResume();
    const corps = $('#corps-achats');
    vider(corps);
    if (this.achats.length === 0) {
      corps.append(creer('tr', {}, [
        creer('td', { classe: 'vide', texte: 'Aucun achat enregistre. Cliquez sur Nouvel achat.', attributs: { colspan: '9' } }),
      ]));
      return;
    }

    for (const achat of this.achats) {
      const dette = achat.detteStatut === 'reglee'
        ? 'Reglee'
        : achat.detteStatut === 'annulee'
          ? 'Annulee'
          : formater(achat.detteSolde ?? 0);
      const actions = creer('td', { classe: 'nombre' }, [
        creer('button', { classe: 'bouton discret', texte: 'Details', sur: { click: () => this.details(achat) } }),
      ]);
      if (achat.statut === 'valide') {
        actions.append(creer('button', {
          classe: 'bouton discret espace-gauche', texte: 'Annuler',
          sur: { click: () => this.annuler(achat) },
        }));
      }
      corps.append(creer('tr', { classe: achat.statut === 'annule' ? 'annulee' : '' }, [
        creer('td', { texte: achat.numero }),
        creer('td', { texte: this.dateCourte(achat.dateAchat) }),
        creer('td', { texte: achat.fournisseurNom }),
        creer('td', { texte: achat.referenceDocument ?? '-' }),
        creer('td', { texte: this.libelleMode(achat.modeReglement) }),
        creer('td', { classe: 'nombre montant', texte: formater(achat.totalTtc) }),
        creer('td', { classe: 'nombre montant dette', texte: dette }),
        creer('td', { texte: achat.statut === 'annule' ? 'Annule' : 'Valide' }),
        actions,
      ]));
    }
  },

  afficherResume() {
    const zone = $('#resume-achats');
    vider(zone);
    const valides = this.achats.filter((a) => a.statut === 'valide');
    const total = valides.reduce((s, a) => s + a.totalTtc, 0);
    const credit = valides.reduce((s, a) => s + (a.detteSolde ?? 0), 0);
    zone.append(
      this.carteResume('Achats', String(valides.length), 'receptions valides'),
      this.carteResume('Montant', formater(total), 'marchandises recues'),
      this.carteResume('A payer', formater(credit), 'solde fournisseurs')
    );
  },

  carteResume(titre, valeur, detail) {
    return creer('div', { classe: 'achat-stat' }, [
      creer('span', { classe: 'libelle-doux', texte: titre }),
      creer('strong', { texte: valeur }),
      creer('small', { texte: detail }),
    ]);
  },

  libelleMode(mode) {
    if (mode === 'credit') return 'Credit fournisseur';
    return LIBELLES_PAIEMENT[mode] ?? mode;
  },

  dateCourte(date) {
    return String(date ?? '').slice(0, 16).replace('T', ' ');
  },

  async nouveauFournisseur() {
    const cree = await Fournisseurs.editer(null);
    if (cree) await this.charger();
  },

  async nouvelArticle() {
    const cree = await Articles.editer(null);
    if (cree) await this.charger();
  },

  async nouveau() {
    if (this.fournisseurs.length === 0) {
      const creerFournisseur = await confirmer(
        'Aucun fournisseur',
        'Creez au moins un fournisseur avant de saisir un achat de marchandise.',
        'Creer un fournisseur'
      );
      if (creerFournisseur) await this.nouveauFournisseur();
      return;
    }
    if (this.articles.length === 0) {
      return ouvrirBoite((fermer) => creer('div', {}, [
        creer('h3', { texte: 'Aucun article' }),
        creer('p', { texte: 'Creez les articles avant de receptionner les achats afin que le stock puisse etre mis a jour.' }),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Fermer', sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Creer un article', sur: { click: async () => { fermer(null); await this.nouvelArticle(); } } }),
        ]),
      ]));
    }

    const achat = await ouvrirBoite((fermer) => {
      const lignes = [];
      const erreur = creer('p', { classe: 'message erreur' });
      const date = creer('input', { attributs: { type: 'date', value: new Date().toISOString().slice(0, 10), required: 'required' } });
      const fournisseur = creer('select', {}, this.fournisseurs.map((f) =>
        creer('option', { texte: f.nom + ' (' + f.code + ')', attributs: { value: String(f.id) } })
      ));
      const reference = creer('input', { attributs: { type: 'text', placeholder: 'numero facture / bon livraison' } });
      const mode = creer('select', {}, [
        creer('option', { texte: 'Credit fournisseur / a payer plus tard', attributs: { value: 'credit' } }),
        creer('option', { texte: 'Especes (sortie caisse)', attributs: { value: 'especes' } }),
        creer('option', { texte: 'Mobile money', attributs: { value: 'mobile' } }),
        creer('option', { texte: 'Carte', attributs: { value: 'carte' } }),
      ]);
      const echeance = creer('input', { attributs: { type: 'date' } });
      const note = creer('input', { attributs: { type: 'text', placeholder: 'note interne' } });

      const article = creer('select');
      for (const a of this.articles) {
        article.append(creer('option', {
          texte: a.designation + ' — ' + a.reference + ' — stock ' + formaterStock(a.stock, a),
          attributs: { value: String(a.id) },
        }));
      }
      const unite = creer('select');
      const quantite = creer('input', { attributs: { type: 'number', min: '1', step: '1', value: '1' } });
      const prix = creer('input', { attributs: { type: 'number', min: '1', step: '1', placeholder: 'prix achat par unite' } });
      const lignesZone = creer('div', { classe: 'lignes-achat-saisie' });
      const totalZone = creer('div', { classe: 'total-achat-saisie' });

      const articleChoisi = () => this.articles.find((a) => a.id === Number(article.value));
      const majUnites = () => {
        const a = articleChoisi();
        vider(unite);
        unite.append(creer('option', { texte: 'Pieces', attributs: { value: 'piece' } }));
        if (a && piecesParCarton(a) > 1) {
          unite.append(creer('option', {
            texte: 'Cartons (' + piecesParCarton(a) + ' pieces)',
            attributs: { value: 'carton' },
          }));
        }
        majAidePrix();
      };
      const majAidePrix = () => {
        const a = articleChoisi();
        if (!a) return;
        prix.placeholder = 'ex: prix de vente ' + formater(prixUnite(a, unite.value));
      };
      const redessinerLignes = () => {
        vider(lignesZone);
        if (lignes.length === 0) {
          lignesZone.append(creer('p', { classe: 'vide compacte', texte: 'Aucune marchandise ajoutee.' }));
        }
        lignes.forEach((l, index) => {
          lignesZone.append(creer('div', { classe: 'ligne-achat-saisie' }, [
            creer('div', {}, [
              creer('strong', { texte: l.designation }),
              creer('span', { texte: l.quantite + ' ' + libelleUnite(l.uniteAchat, l.quantite) + ' = ' + formaterStock(l.quantiteStock, l) }),
            ]),
            creer('span', { classe: 'montant', texte: formater(l.prixAchatUnitaire) + ' / ' + libelleUnite(l.uniteAchat) }),
            creer('strong', { classe: 'montant', texte: formater(l.totalTtc) }),
            creer('button', {
              classe: 'retirer', texte: 'x', attributs: { type: 'button', title: 'Retirer la ligne' },
              sur: { click: () => { lignes.splice(index, 1); redessinerLignes(); } },
            }),
          ]));
        });
        const total = lignes.reduce((s, l) => s + l.totalTtc, 0);
        const pieces = lignes.reduce((s, l) => s + l.quantiteStock, 0);
        totalZone.textContent = 'Total achat : ' + formater(total) + ' — Entree stock : ' + pieces + ' piece(s)';
      };
      const ajouterLigne = () => {
        const a = articleChoisi();
        if (!a) return afficherMessage(erreur, 'Choisissez un article.');
        const q = Number(quantite.value);
        const p = Number(prix.value);
        if (!Number.isInteger(q) || q <= 0) return afficherMessage(erreur, 'La quantite doit etre un entier positif.');
        if (!Number.isInteger(p) || p <= 0) return afficherMessage(erreur, 'Le prix achat doit etre un entier positif.');
        const facteur = facteurUnite(a, unite.value);
        lignes.push({
          articleId: a.id,
          reference: a.reference,
          designation: a.designation,
          uniteAchat: unite.value,
          facteurStock: facteur,
          piecesParCarton: piecesParCarton(a),
          quantite: q,
          quantiteStock: q * facteur,
          prixAchatUnitaire: p,
          tauxTva: a.tauxTva,
          totalTtc: q * p,
        });
        afficherMessage(erreur, '');
        quantite.value = '1';
        prix.value = '';
        redessinerLignes();
      };
      const enregistrer = async () => {
        if (lignes.length === 0) return afficherMessage(erreur, 'Ajoutez au moins une ligne de marchandise.');
        try {
          const sauve = await appeler(window.caisse.achats.enregistrer({
            fournisseurId: Number(fournisseur.value),
            dateAchat: date.value,
            referenceDocument: reference.value,
            modeReglement: mode.value,
            dateEcheance: echeance.value,
            note: note.value,
            lignes: lignes.map((l) => ({
              articleId: l.articleId,
              uniteAchat: l.uniteAchat,
              quantite: l.quantite,
              prixAchatUnitaire: l.prixAchatUnitaire,
              tauxTva: l.tauxTva,
            })),
          }));
          fermer(sauve);
        } catch (probleme) {
          afficherMessage(erreur, probleme.message);
        }
      };

      article.addEventListener('change', majUnites);
      unite.addEventListener('change', majAidePrix);
      majUnites();
      redessinerLignes();

      return creer('form', {
        classe: 'formulaire-achat',
        sur: { submit: (e) => { e.preventDefault(); enregistrer(); } },
      }, [
        creer('h3', { texte: 'Nouvel achat de marchandise' }),
        creer('p', { classe: 'aide', texte: 'Le stock sera augmente immediatement. Le paiement comptant exige une caisse ouverte ; le credit cree une dette fournisseur.' }),
        erreur,
        creer('div', { classe: 'grille-formulaire' }, [
          creer('label', { texte: 'Date achat' }, [date]),
          creer('label', { texte: 'Fournisseur' }, [fournisseur]),
          creer('label', { texte: 'Document' }, [reference]),
          creer('label', { texte: 'Mode de reglement' }, [mode]),
          creer('label', { texte: 'Echeance credit' }, [echeance]),
          creer('label', { texte: 'Note' }, [note]),
        ]),
        creer('div', { classe: 'ajout-ligne-achat' }, [
          creer('label', { texte: 'Article' }, [article]),
          creer('label', { texte: 'Unite' }, [unite]),
          creer('label', { texte: 'Quantite' }, [quantite]),
          creer('label', { texte: 'Prix achat / unite' }, [prix]),
          creer('button', { classe: 'bouton discret', texte: 'Ajouter ligne', attributs: { type: 'button' }, sur: { click: ajouterLigne } }),
        ]),
        lignesZone,
        totalZone,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Valider achat et stock', attributs: { type: 'submit' } }),
        ]),
      ]);
    });

    if (achat) {
      await this.charger();
      await this.details(achat);
    }
  },

  async details(achatCourt) {
    const achat = await appeler(window.caisse.achats.lire({ id: achatCourt.id }));
    await ouvrirBoite((fermer) => {
      const lignes = creer('div', { classe: 'details-achats-lignes' });
      for (const l of achat.lignes) {
        lignes.append(creer('div', { classe: 'ligne-cloture' }, [
          creer('span', { texte: l.designation + ' — ' + l.quantite + ' ' + libelleUnite(l.uniteAchat, l.quantite) + ' (' + l.quantiteStockLibelle + ')' }),
          creer('span', { classe: 'montant', texte: formater(l.totalTtc) }),
        ]));
      }
      return creer('div', { classe: 'details-achats' }, [
        creer('h3', { texte: 'Achat ' + achat.numero }),
        creer('p', { classe: 'aide', texte: achat.fournisseurNom + ' — ' + this.dateCourte(achat.dateAchat) + (achat.referenceDocument ? ' — doc ' + achat.referenceDocument : '') }),
        lignes,
        creer('div', { classe: 'ligne-cloture forte' }, [
          creer('span', { texte: 'Total TTC' }),
          creer('span', { classe: 'montant', texte: formater(achat.totalTtc) }),
        ]),
        creer('div', { classe: 'ligne-cloture' }, [
          creer('span', { texte: 'TVA incluse' }),
          creer('span', { classe: 'montant', texte: formater(achat.totalTva) }),
        ]),
        creer('div', { classe: 'ligne-cloture' }, [
          creer('span', { texte: 'Dette fournisseur' }),
          creer('span', { classe: 'montant dette', texte: achat.detteStatut === 'reglee' ? 'Reglee' : formater(achat.detteSolde ?? 0) }),
        ]),
        achat.note ? creer('p', { classe: 'aide', texte: 'Note : ' + achat.note }) : creer('span'),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ]);
    });
  },

  async annuler(achat) {
    const confirme = await confirmer(
      'Annuler ' + achat.numero + ' ?',
      "Le stock sera retire exactement selon les lignes de l'achat. L'annulation est refusee si la dette a deja ete payee ou si le stock est insuffisant.",
      'Annuler achat'
    );
    if (!confirme) return;
    const motif = await ouvrirBoite((fermer) => {
      const champ = creer('input', { attributs: { type: 'text', placeholder: 'motif obligatoire', required: 'required' } });
      const erreur = creer('p', { classe: 'message erreur' });
      return creer('form', { sur: { submit: (e) => {
        e.preventDefault();
        if (!champ.value.trim()) return afficherMessage(erreur, 'Le motif est obligatoire.');
        fermer(champ.value.trim());
      } } }, [
        creer('h3', { texte: 'Motif annulation ' + achat.numero }),
        erreur,
        creer('label', { texte: 'Motif' }, [champ]),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Abandonner', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton danger', texte: 'Annuler definitivement', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (!motif) return;
    try {
      await appeler(window.caisse.achats.annuler({ id: achat.id, motif }));
      await this.charger();
    } catch (probleme) {
      await ouvrirBoite((fermer) => creer('div', {}, [
        creer('h3', { texte: 'Annulation refusee' }),
        creer('p', { texte: probleme.message }),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ]));
    }
  },
};

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
        creer('td', { classe: 'vide', texte: 'Aucun achat enregistre. Cliquez sur Nouvel achat.', attributs: { colspan: '10' } }),
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
          classe: 'bouton discret espace-gauche', texte: 'Retour',
          sur: { click: () => this.retourner(achat) },
        }));
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
        creer('td', { classe: 'nombre montant retour-fournisseur-montant', texte: achat.totalRetours > 0 ? formater(achat.totalRetours) : '-' }),
        creer('td', { classe: 'nombre montant dette', texte: dette }),
        creer('td', { texte: achat.statut === 'annule' ? 'Annule' : (achat.totalRetours > 0 ? 'Retour partiel' : 'Valide') }),
        actions,
      ]));
    }
  },

  afficherResume() {
    const zone = $('#resume-achats');
    vider(zone);
    const valides = this.achats.filter((a) => a.statut === 'valide');
    const total = valides.reduce((s, a) => s + a.totalTtc, 0);
    const retours = valides.reduce((s, a) => s + (a.totalRetours ?? 0), 0);
    const credit = valides.reduce((s, a) => s + (a.detteSolde ?? 0), 0);
    zone.append(
      this.carteResume('Achats', String(valides.length), 'receptions valides'),
      this.carteResume('Montant net', formater(Math.max(0, total - retours)), 'apres retours'),
      this.carteResume('Retours', formater(retours), 'marchandises renvoyees'),
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

  async retourner(achatCourt) {
    const achat = await appeler(window.caisse.achats.lire({ id: achatCourt.id }));
    const lignesDisponibles = achat.lignes.filter((l) => l.quantiteRetourable > 0);
    if (lignesDisponibles.length === 0) {
      return ouvrirBoite((fermer) => creer('div', {}, [
        creer('h3', { texte: 'Aucun retour possible' }),
        creer('p', { texte: 'Toutes les marchandises de cet achat ont deja ete retournees.' }),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ]));
    }

    const retour = await ouvrirBoite((fermer) => {
      const erreur = creer('p', { classe: 'message erreur' });
      const date = creer('input', { attributs: { type: 'date', value: new Date().toISOString().slice(0, 10), required: 'required' } });
      const reference = creer('input', { attributs: { type: 'text', placeholder: 'bon retour / avoir fournisseur' } });
      const note = creer('input', { attributs: { type: 'text', placeholder: 'motif, observation...' } });
      const lignesZone = creer('div', { classe: 'lignes-retour-fournisseur' });
      const totalZone = creer('div', { classe: 'total-achat-saisie' });
      const champs = new Map();

      const recalculer = () => {
        let total = 0;
        let pieces = 0;
        for (const l of lignesDisponibles) {
          const q = Number(champs.get(l.id).value) || 0;
          total += q * l.prixAchatUnitaire;
          pieces += q * l.facteurStock;
        }
        totalZone.textContent = 'Retour fournisseur : ' + formater(total) + ' — Sortie stock : ' + pieces + ' piece(s)';
      };

      for (const l of lignesDisponibles) {
        const quantite = creer('input', {
          attributs: {
            type: 'number', min: '0', max: String(l.quantiteRetourable), step: '1', value: '0',
          },
          sur: { input: recalculer },
        });
        champs.set(l.id, quantite);
        lignesZone.append(creer('div', { classe: 'ligne-retour-fournisseur' }, [
          creer('div', {}, [
            creer('strong', { texte: l.designation }),
            creer('span', { texte: 'Achat : ' + l.quantite + ' ' + libelleUnite(l.uniteAchat, l.quantite) + ' — deja retourne : ' + l.quantiteRetournee }),
            creer('span', { texte: 'Retour possible : ' + l.quantiteRetourable + ' ' + libelleUnite(l.uniteAchat, l.quantiteRetourable) + ' (' + formaterStock(l.quantiteStockRetourable, l) + ')' }),
          ]),
          creer('span', { classe: 'montant', texte: formater(l.prixAchatUnitaire) + ' / ' + libelleUnite(l.uniteAchat) }),
          creer('label', { texte: 'Quantite retour' }, [quantite]),
        ]));
      }

      const enregistrer = async () => {
        const lignes = lignesDisponibles.map((l) => ({
          ligneAchatId: l.id,
          quantite: Number(champs.get(l.id).value) || 0,
        })).filter((l) => l.quantite > 0);
        if (lignes.length === 0) return afficherMessage(erreur, 'Indiquez au moins une quantite a retourner.');
        try {
          fermer(await appeler(window.caisse.achats.retourner({
            achatId: achat.id,
            dateRetour: date.value,
            referenceDocument: reference.value,
            note: note.value,
            lignes,
          })));
        } catch (probleme) {
          afficherMessage(erreur, probleme.message);
        }
      };

      recalculer();
      return creer('form', {
        classe: 'formulaire-retour-fournisseur',
        sur: { submit: (e) => { e.preventDefault(); enregistrer(); } },
      }, [
        creer('h3', { texte: 'Retour fournisseur - ' + achat.numero }),
        creer('p', { classe: 'aide', texte: achat.fournisseurNom + ' — le stock sera retire. La dette fournisseur sera diminuee si elle est encore ouverte ; sinon le montant restera note comme avoir fournisseur.' }),
        erreur,
        creer('div', { classe: 'grille-formulaire' }, [
          creer('label', { texte: 'Date retour' }, [date]),
          creer('label', { texte: 'Document retour / avoir' }, [reference]),
          creer('label', { texte: 'Note' }, [note]),
        ]),
        lignesZone,
        totalZone,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton danger', texte: 'Valider le retour', attributs: { type: 'submit' } }),
        ]),
      ]);
    });

    if (retour) {
      await this.charger();
      await this.details(achat);
    }
    return retour;
  },

  async details(achatCourt) {
    const achat = await appeler(window.caisse.achats.lire({ id: achatCourt.id }));
    await ouvrirBoite((fermer) => {
      const lignes = creer('div', { classe: 'details-achats-lignes' });
      for (const l of achat.lignes) {
        const retourInfo = l.quantiteRetournee > 0
          ? ' — retourne ' + l.quantiteRetournee + ' ' + libelleUnite(l.uniteAchat, l.quantiteRetournee)
          : '';
        lignes.append(creer('div', { classe: 'ligne-cloture' }, [
          creer('span', { texte: l.designation + ' — ' + l.quantite + ' ' + libelleUnite(l.uniteAchat, l.quantite) + ' (' + l.quantiteStockLibelle + ')' + retourInfo }),
          creer('span', { classe: 'montant', texte: formater(l.totalTtc) }),
        ]));
      }
      const retours = creer('div', { classe: 'details-achats-lignes retours-achats-lignes' });
      if ((achat.retours ?? []).length === 0) {
        retours.append(creer('p', { classe: 'vide compacte', texte: 'Aucun retour fournisseur sur cet achat.' }));
      } else {
        for (const r of achat.retours) {
          const libelleLignes = r.lignes.map((l) => l.designation + ' x ' + l.quantite).join(', ');
          retours.append(creer('div', { classe: 'ligne-cloture ' + (r.statut === 'annule' ? 'annulee' : '') }, [
            creer('span', { texte: r.numero + ' — ' + this.dateCourte(r.dateRetour) + ' — ' + libelleLignes }),
            creer('span', { classe: 'montant', texte: formater(r.totalTtc) + (r.montantAvoir > 0 ? ' avoir' : '') }),
          ]));
        }
      }
      return creer('div', { classe: 'details-achats' }, [
        creer('h3', { texte: 'Achat ' + achat.numero }),
        creer('p', { classe: 'aide', texte: achat.fournisseurNom + ' — ' + this.dateCourte(achat.dateAchat) + (achat.referenceDocument ? ' — doc ' + achat.referenceDocument : '') }),
        lignes,
        creer('h3', { texte: 'Retours fournisseur' }),
        retours,
        creer('div', { classe: 'ligne-cloture forte' }, [
          creer('span', { texte: 'Total TTC' }),
          creer('span', { classe: 'montant', texte: formater(achat.totalTtc) }),
        ]),
        creer('div', { classe: 'ligne-cloture' }, [
          creer('span', { texte: 'Retours fournisseur' }),
          creer('span', { classe: 'montant retour-fournisseur-montant', texte: formater(achat.totalRetours ?? 0) }),
        ]),
        creer('div', { classe: 'ligne-cloture' }, [
          creer('span', { texte: 'Net marchandise' }),
          creer('span', { classe: 'montant', texte: formater(achat.montantNet ?? Math.max(0, achat.totalTtc - (achat.totalRetours ?? 0))) }),
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

'use strict';

/* Catalogue. Consultable par tous, modifiable par l'administrateur seul :
   c'est le processus principal qui tranche, l'ecran ne fait que masquer
   les boutons qui n'aboutiraient pas. */

const Articles = {
  liste: [],
  // Articles coches pour l'impression d'etiquettes, par identifiant.
  selection: new Set(),

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);

    this.boutonEtiquettes = creer('button', {
      classe: 'bouton discret',
      sur: { click: () => this.imprimerEtiquettes() },
    });
    actions.append(this.boutonEtiquettes);

    if (App.utilisateur.role === 'administrateur') {
      actions.append(creer('button', {
        classe: 'bouton espace-gauche', texte: 'Nouvel article',
        sur: { click: () => this.editer(null) },
      }));
    }
    await this.charger();
  },

  rafraichirBouton() {
    const nombre = this.selection.size;
    this.boutonEtiquettes.textContent = nombre === 0
      ? 'Imprimer des etiquettes'
      : 'Imprimer les etiquettes (' + nombre + ')';
    this.boutonEtiquettes.disabled = nombre === 0;
  },

  basculer(article, coche) {
    if (coche) this.selection.add(article.id);
    else this.selection.delete(article.id);
    this.rafraichirBouton();
  },

  async charger() {
    this.liste = await appeler(window.caisse.articles.lister());
    // Un article retire du catalogue ne doit pas rester coche.
    const presents = new Set(this.liste.map((a) => a.id));
    for (const id of [...this.selection]) if (!presents.has(id)) this.selection.delete(id);
    this.afficher();
  },

  afficher() {
    const corps = $('#corps-articles');
    vider(corps);

    if (this.liste.length === 0) {
      corps.append(creer('tr', {}, [
        creer('td', { classe: 'vide', texte: 'Aucun article. Commencez par en creer un.', attributs: { colspan: '12' } }),
      ]));
      return;
    }

    const admin = App.utilisateur.role === 'administrateur';

    for (const article of this.liste) {
      const bas = article.seuilAlerte > 0 && article.stock <= article.seuilAlerte;
      const dessinable = article.codeBarres
        ? window.caisse.calcul.codeBarresDessinable(article.codeBarres)
        : false;

      const case_ = creer('input', {
        attributs: {
          type: 'checkbox',
          title: dessinable
            ? 'Choisir pour l impression d etiquettes'
            : "Cet article n'a pas de code-barres dessinable",
        },
        sur: { change: (e) => this.basculer(article, e.target.checked) },
      });
      case_.checked = this.selection.has(article.id);
      if (!dessinable) {
        case_.disabled = true;
        this.selection.delete(article.id);
      }

      const cellules = [
        creer('td', { classe: 'choix' }, [case_]),
        creer('td', { texte: article.reference }),
        creer('td', { classe: 'code-barres', texte: [
          article.codeBarres ? 'P: ' + article.codeBarres : 'P: -',
          article.codeBarresCarton ? 'C: ' + article.codeBarresCarton : null,
        ].filter(Boolean).join(' / ') }),
        creer('td', { texte: article.designation }),
        creer('td', { texte: article.conditionnement ?? ('1 carton = ' + piecesParCarton(article) + ' pieces') }),
        this.cellulePrixAchat(article),
        creer('td', { classe: 'nombre montant', texte: formater(article.prixUnitaire) }),
        creer('td', { classe: 'nombre montant', texte: article.venteCarton ? formater(prixUnite(article, 'carton')) : '-' }),
        creer('td', { classe: 'nombre', texte: article.tauxTva + ' %' }),
        creer('td', { classe: 'nombre', texte: article.stockLibelle ?? formaterStock(article.stock, article) }),
        creer('td', { classe: 'nombre', texte: article.seuilAlerte > 0 ? formaterStock(article.seuilAlerte, article) : '-' }),
      ];

      const actions = creer('td', { classe: 'nombre' });
      if (admin) {
        actions.append(
          creer('button', {
            classe: 'bouton discret', texte: 'Stock',
            sur: { click: () => this.mouvementStock(article) },
          }),
          creer('button', {
            classe: 'bouton discret espace-gauche', texte: 'Modifier',
            sur: { click: () => this.editer(article) },
          }),
          creer('button', {
            classe: 'bouton discret espace-gauche', texte: 'Retirer',
            sur: { click: () => this.retirer(article) },
          })
        );
      }
      cellules.push(actions);

      corps.append(creer('tr', { classe: bas ? 'stock-bas' : '' }, cellules));
    }
    this.rafraichirBouton();
  },

  cellulePrixAchat(article) {
    const lignes = [];
    if (article.prixAchatPiece !== null && article.prixAchatPiece !== undefined) {
      lignes.push(creer('div', { texte: 'P: ' + formater(article.prixAchatPiece) }));
    }
    if (piecesParCarton(article) > 1 && article.prixAchatCarton !== null && article.prixAchatCarton !== undefined) {
      lignes.push(creer('div', { texte: 'C: ' + formater(article.prixAchatCarton) }));
    }
    if (lignes.length === 0) {
      return creer('td', { classe: 'nombre prix-achat-article vide-prix', texte: '-' });
    }
    return creer('td', { classe: 'nombre montant prix-achat-article' }, lignes);
  },

  /**
   * Ouvre la fiche d'un article, ou une fiche vierge. valeursParDefaut sert a
   * la douchette : elle y depose le code lu pour qu'il soit deja rempli.
   * Rend l'article enregistre, ou null si la saisie a ete abandonnee.
   */
  async editer(article, valeursParDefaut = {}) {
    const donnees = await ouvrirBoite((fermer) => {
      const champ = (nom, etiquette, attributs) => {
        const entree = creer('input', { attributs: { name: nom, ...attributs } });
        return { entree, bloc: creer('label', { texte: etiquette }, [entree]) };
      };

      // Declare avant les champs : le bouton d'attribution y ecrit ses erreurs.
      const erreur = creer('p', { classe: 'message erreur' });

      const reference = champ('reference', 'Reference', { type: 'text', required: 'required', value: article?.reference ?? valeursParDefaut.reference ?? '' });
      const code = champ('codeBarres', 'Code-barres (facultatif)', {
        type: 'text', inputmode: 'numeric', autocomplete: 'off',
        placeholder: 'a scanner ou a saisir',
        value: article?.codeBarres ?? valeursParDefaut.codeBarres ?? '',
      });
      const verdictCode = creer('div', { classe: 'verdict' });

      // Retour immediat : une cle fausse se voit a la saisie, pas a l'envoi.
      const juger = () => {
        const saisie = code.entree.value.trim();
        if (saisie === '') return (verdictCode.textContent = '');

        const verdict = window.caisse.calcul.verifierCodeBarres(saisie);
        if (!verdict.valide) {
          verdictCode.textContent = verdict.motif;
          verdictCode.className = 'verdict mauvais';
          return;
        }
        if (window.caisse.calcul.codeBarresUsageInterne(saisie)) {
          verdictCode.textContent = "Code EAN-13 valide, reserve a l'usage interne du magasin.";
        } else if (verdict.type === 'libre') {
          verdictCode.textContent =
            'Code libre : accepte pour la douchette, mais il ne peut pas etre imprime ' +
            'en etiquette. Attribuez plutot un code interne.';
        } else {
          verdictCode.textContent = 'Code ' + verdict.type + ' valide.';
        }
        verdictCode.className = 'verdict bon';
      };
      code.entree.addEventListener('input', juger);

      // Pour ce que la boutique etiquette elle-meme : un EAN-13 a prefixe
      // reserve, qui ne rencontrera jamais le code d'un fabricant.
      const attribuer = creer('button', {
        classe: 'bouton discret menu-code', texte: 'Attribuer un code interne',
        attributs: { type: 'button' },
        sur: {
          click: async (evenement) => {
            evenement.target.disabled = true;
            try {
              const attribue = await appeler(window.caisse.articles.attribuerCodeInterne());
              code.entree.value = attribue.code;
              juger();
            } catch (probleme) {
              afficherMessage(erreur, probleme.message);
            } finally {
              evenement.target.disabled = false;
            }
          },
        },
      });
      const designation = champ('designation', 'Designation', { type: 'text', required: 'required', value: article?.designation ?? '' });
      const pieces = champ('piecesParCarton', 'Pieces par carton (1 si vente piece seule)', { type: 'number', min: '1', step: '1', required: 'required', value: article?.piecesParCarton ?? '1' });
      const codeCarton = champ('codeBarresCarton', 'Code-barres carton (facultatif)', {
        type: 'text', inputmode: 'numeric', autocomplete: 'off',
        placeholder: 'code du carton complet',
        value: article?.codeBarresCarton ?? valeursParDefaut.codeBarresCarton ?? '',
      });
      const prixAchatPiece = champ('prixAchatPiece', "Prix d'achat TTC piece (F)", { type: 'number', min: '0', step: '1', value: article?.prixAchatPiece ?? '', placeholder: 'prix fournisseur par piece' });
      const prixAchatCarton = champ('prixAchatCarton', "Prix d'achat TTC carton (facultatif)", { type: 'number', min: '0', step: '1', value: article?.prixAchatCarton ?? '', placeholder: 'prix fournisseur du carton' });
      const prix = champ('prixUnitaire', 'Prix de vente TTC piece (F)', { type: 'number', min: '0', step: '1', required: 'required', value: article?.prixUnitaire ?? '' });
      const prixCarton = champ('prixCarton', 'Prix de vente TTC carton (vide = piece x quantite)', { type: 'number', min: '0', step: '1', value: article?.prixCarton ?? '' });
      const taux = champ('tauxTva', 'Taux de TVA (%)', { type: 'number', min: '0', step: '0.5', required: 'required', value: article?.tauxTva ?? App.parametres['tva.taux_par_defaut'] ?? '18' });
      const stock = champ('stock', 'Stock courant total en pieces (correction journalisee)', { type: 'number', min: '0', step: '1', required: 'required', value: article?.stock ?? '0' });
      const seuil = champ('seuilAlerte', "Seuil d'alerte en pieces (0 = aucun)", { type: 'number', min: '0', step: '1', required: 'required', value: article?.seuilAlerte ?? '0' });

      const enregistrer = async () => {
        try {
          const saisie = {
            reference: reference.entree.value,
            codeBarres: code.entree.value,
            codeBarresCarton: codeCarton.entree.value,
            designation: designation.entree.value,
            piecesParCarton: Number(pieces.entree.value),
            prixAchatPiece: prixAchatPiece.entree.value === '' ? null : Number(prixAchatPiece.entree.value),
            prixAchatCarton: prixAchatCarton.entree.value === '' ? null : Number(prixAchatCarton.entree.value),
            prixUnitaire: Number(prix.entree.value),
            prixCarton: prixCarton.entree.value === '' ? null : Number(prixCarton.entree.value),
            tauxTva: Number(taux.entree.value),
            stock: Number(stock.entree.value),
            seuilAlerte: Number(seuil.entree.value),
          };
          const enregistre = article
            ? await appeler(window.caisse.articles.modifier({ id: article.id, article: saisie }))
            : await appeler(window.caisse.articles.creer(saisie));
          fermer(enregistre);
        } catch (e) {
          afficherMessage(erreur, e.message);
        }
      };

      const formulaire = creer('form', { sur: { submit: (e) => { e.preventDefault(); enregistrer(); } } }, [
        creer('h3', { texte: article ? 'Modifier ' + article.designation : 'Nouvel article' }),
        erreur,
        reference.bloc, code.bloc, attribuer, verdictCode, designation.bloc,
        pieces.bloc, codeCarton.bloc, prixAchatPiece.bloc, prixAchatCarton.bloc,
        prix.bloc, prixCarton.bloc, taux.bloc, stock.bloc, seuil.bloc,
        creer('div', { classe: 'actions' }, [
          creer('button', {
            classe: 'bouton discret', texte: 'Annuler',
            attributs: { type: 'button' }, sur: { click: () => fermer(null) },
          }),
          creer('button', { classe: 'bouton', texte: 'Enregistrer', attributs: { type: 'submit' } }),
        ]),
      ]);
      return formulaire;
    });

    if (donnees) await this.charger();
    return donnees;
  },

  async mouvementStock(article) {
    const fournisseurs = await appeler(window.caisse.fournisseurs.lister()).catch(() => []);
    const fait = await ouvrirBoite((fermer) => {
      const type = creer('select', {}, [
        creer('option', { texte: 'Entree en stock', attributs: { value: 'entree' } }),
        creer('option', { texte: 'Sortie / casse / perte', attributs: { value: 'sortie' } }),
        creer('option', { texte: 'Correction par ecart', attributs: { value: 'ajustement' } }),
      ]);
      const unite = creer('select', {}, [
        creer('option', { texte: 'Pieces', attributs: { value: 'piece' } }),
        ...(article.piecesParCarton > 1 ? [creer('option', {
          texte: 'Cartons (' + article.piecesParCarton + ' pieces)', attributs: { value: 'carton' },
        })] : []),
      ]);
      const quantite = creer('input', { attributs: { type: 'number', step: '1', min: '1', required: 'required' } });
      const motif = creer('input', { attributs: { type: 'text', placeholder: 'livraison, casse, inventaire...', required: 'required' } });
      const reference = creer('input', { attributs: { type: 'text', placeholder: 'bon, facture...' } });
      const fournisseur = creer('select', {}, [
        creer('option', { texte: 'Aucun fournisseur', attributs: { value: '' } }),
        ...fournisseurs.map((f) => creer('option', { texte: f.nom, attributs: { value: String(f.id) } })),
      ]);
      const aide = creer('p', { classe: 'aide', texte: 'Stock actuel : ' + formaterStock(article.stock, article) + '. Pour une correction, saisissez un ecart positif ou negatif.' });
      const erreur = creer('p', { classe: 'message erreur' });
      const rafraichirAide = () => {
        quantite.min = type.value === 'ajustement' ? '' : '1';
        const uniteTexte = unite.value === 'carton' ? 'carton(s)' : 'piece(s)';
        aide.textContent = type.value === 'ajustement'
          ? 'Stock actuel : ' + formaterStock(article.stock, article) + '. Saisissez +5 ou -2 ' + uniteTexte + ' pour corriger l ecart.'
          : 'Stock actuel : ' + formaterStock(article.stock, article) + '. La quantite saisie en ' + uniteTexte + ' sera ' + (type.value === 'entree' ? 'ajoutee.' : 'retiree.');
      };
      type.addEventListener('change', rafraichirAide);
      unite.addEventListener('change', rafraichirAide);
      rafraichirAide();
      return creer('form', { sur: { submit: async (e) => {
        e.preventDefault();
        try {
          fermer(await appeler(window.caisse.stock.mouvement({
            articleId: article.id,
            type: type.value,
            unite: unite.value,
            quantite: Number(quantite.value),
            motif: motif.value,
            reference: reference.value,
            fournisseurId: fournisseur.value ? Number(fournisseur.value) : null,
          })));
        } catch (probleme) { afficherMessage(erreur, probleme.message); }
      } } }, [
        creer('h3', { texte: 'Mouvement de stock - ' + article.designation }),
        aide,
        erreur,
        creer('label', { texte: 'Operation' }, [type]),
        creer('label', { texte: 'Unite de saisie' }, [unite]),
        creer('label', { texte: 'Quantite / ecart' }, [quantite]),
        creer('label', { texte: 'Motif' }, [motif]),
        creer('label', { texte: 'Reference document' }, [reference]),
        creer('label', { texte: 'Fournisseur' }, [fournisseur]),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Enregistrer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (fait) await this.charger();
  },

  /**
   * Boite d'impression des etiquettes. L'apercu est dessine par la meme
   * fonction que la planche : ce qui est montre est ce qui sortira.
   */
  async imprimerEtiquettes() {
    const choisis = this.liste.filter((a) => this.selection.has(a.id));
    if (choisis.length === 0) return;

    const formats = window.caisse.etiquettes.formats();

    await ouvrirBoite((fermer) => {
      const format = creer('select', {}, Object.entries(formats).map(([cle, reglage]) =>
        creer('option', { texte: reglage.intitule, attributs: { value: cle } })));

      const nombre = creer('input', {
        attributs: { type: 'number', min: '1', max: '200', step: '1', value: '1' },
      });

      const avecPrix = creer('input', { attributs: { type: 'checkbox' } });
      avecPrix.checked = true;

      const apercu = creer('div', { classe: 'apercu-etiquette' });
      const message = creer('p', { classe: 'message' });

      const redessiner = () => {
        vider(apercu);
        const svg = window.caisse.calcul.codeBarresEnSvg(choisis[0].codeBarres, { hauteurBarres: 40 });
        // DOMParser plutot qu'innerHTML : rien d'injectable, et la politique
        // de securite du contenu reste stricte.
        const dessin = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
        apercu.append(
          creer('div', { classe: 'apercu-designation', texte: choisis[0].designation }),
          dessin
        );
        if (avecPrix.checked) {
          apercu.append(creer('div', {
            classe: 'apercu-prix', texte: formater(choisis[0].prixUnitaire),
          }));
        }
      };

      avecPrix.addEventListener('change', redessiner);

      const demande = () => ({
        articles: choisis.map((a) => ({
          designation: a.designation,
          prixUnitaire: a.prixUnitaire,
          codeBarres: a.codeBarres,
          quantite: Number(nombre.value) || 1,
        })),
        format: format.value,
        avecPrix: avecPrix.checked,
      });

      const lancer = async (action, bouton) => {
        bouton.disabled = true;
        afficherMessage(message, '');
        try {
          const resultat = await appeler(window.caisse.etiquettes[action](demande()));
          fermer(resultat);
        } catch (erreur) {
          afficherMessage(message, erreur.message);
          bouton.disabled = false;
        }
      };

      const imprimer = creer('button', { classe: 'bouton', texte: 'Imprimer' });
      imprimer.addEventListener('click', () => lancer('imprimer', imprimer));
      const pdf = creer('button', { classe: 'bouton discret', texte: 'PDF' });
      pdf.addEventListener('click', () => lancer('pdf', pdf));

      const boite = creer('div', {}, [
        creer('h3', { texte: 'Etiquettes pour ' + choisis.length + ' article(s)' }),
        message,
        apercu,
        creer('label', { texte: 'Format de planche' }, [format]),
        creer('label', { texte: 'Exemplaires par article' }, [nombre]),
        creer('label', { classe: 'case' }, [avecPrix, creer('span', { texte: 'Imprimer le prix' })]),
        creer('div', { classe: 'actions' }, [
          creer('button', {
            classe: 'bouton discret', texte: 'Annuler', sur: { click: () => fermer(null) },
          }),
          pdf, imprimer,
        ]),
      ]);

      redessiner();
      return boite;
    });
  },

  async retirer(article) {
    const confirme = await confirmer(
      'Retirer ' + article.designation + ' ?',
      "L'article sort du catalogue et de la caisse. Les tickets deja emis le gardent.",
      'Retirer'
    );
    if (!confirme) return;
    await appeler(window.caisse.articles.retirer({ id: article.id }));
    await this.charger();
  },
};

'use strict';

/* Catalogue. Consultable par tous, modifiable par l'administrateur seul :
   c'est le processus principal qui tranche, l'ecran ne fait que masquer
   les boutons qui n'aboutiraient pas. */

const Articles = {
  liste: [],

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    if (App.utilisateur.role === 'administrateur') {
      actions.append(creer('button', {
        classe: 'bouton', texte: 'Nouvel article',
        sur: { click: () => this.editer(null) },
      }));
    }
    await this.charger();
  },

  async charger() {
    this.liste = await appeler(window.caisse.articles.lister());
    this.afficher();
  },

  afficher() {
    const corps = $('#corps-articles');
    vider(corps);

    if (this.liste.length === 0) {
      corps.append(creer('tr', {}, [
        creer('td', { classe: 'vide', texte: 'Aucun article. Commencez par en creer un.', attributs: { colspan: '7' } }),
      ]));
      return;
    }

    const admin = App.utilisateur.role === 'administrateur';

    for (const article of this.liste) {
      const bas = article.seuilAlerte > 0 && article.stock <= article.seuilAlerte;
      const cellules = [
        creer('td', { texte: article.reference }),
        creer('td', { texte: article.designation }),
        creer('td', { classe: 'nombre montant', texte: formater(article.prixUnitaire) }),
        creer('td', { classe: 'nombre', texte: article.tauxTva + ' %' }),
        creer('td', { classe: 'nombre', texte: String(article.stock) }),
        creer('td', { classe: 'nombre', texte: article.seuilAlerte > 0 ? String(article.seuilAlerte) : '-' }),
      ];

      const actions = creer('td', { classe: 'nombre' });
      if (admin) {
        actions.append(
          creer('button', {
            classe: 'bouton discret', texte: 'Modifier',
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
  },

  async editer(article) {
    const donnees = await ouvrirBoite((fermer) => {
      const champ = (nom, etiquette, attributs) => {
        const entree = creer('input', { attributs: { name: nom, ...attributs } });
        return { entree, bloc: creer('label', { texte: etiquette }, [entree]) };
      };

      const reference = champ('reference', 'Reference', { type: 'text', required: 'required', value: article?.reference ?? '' });
      const designation = champ('designation', 'Designation', { type: 'text', required: 'required', value: article?.designation ?? '' });
      const prix = champ('prixUnitaire', 'Prix de vente TTC (F)', { type: 'number', min: '0', step: '1', required: 'required', value: article?.prixUnitaire ?? '' });
      const taux = champ('tauxTva', 'Taux de TVA (%)', { type: 'number', min: '0', step: '0.5', required: 'required', value: article?.tauxTva ?? App.parametres['tva.taux_par_defaut'] ?? '18' });
      const stock = champ('stock', 'Stock', { type: 'number', step: '1', required: 'required', value: article?.stock ?? '0' });
      const seuil = champ('seuilAlerte', "Seuil d'alerte (0 = aucun)", { type: 'number', min: '0', step: '1', required: 'required', value: article?.seuilAlerte ?? '0' });

      const erreur = creer('p', { classe: 'message erreur' });

      const enregistrer = async () => {
        try {
          const saisie = {
            reference: reference.entree.value,
            designation: designation.entree.value,
            prixUnitaire: Number(prix.entree.value),
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
        reference.bloc, designation.bloc, prix.bloc, taux.bloc, stock.bloc, seuil.bloc,
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

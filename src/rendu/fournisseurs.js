'use strict';

const Fournisseurs = {
  liste: [],
  dettes: [],

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    if (App.peut('fournisseurs:gerer')) {
      actions.append(
        creer('button', { classe: 'bouton', texte: 'Nouveau fournisseur', sur: { click: () => this.editer(null) } }),
        creer('button', { classe: 'bouton discret espace-gauche', texte: 'Dette anterieure', sur: { click: () => this.detteAnterieure() } })
      );
    }
    await this.charger();
  },

  async charger() {
    const [liste, dettes] = await Promise.all([
      appeler(window.caisse.fournisseurs.lister()),
      appeler(window.caisse.fournisseurs.dettes({ inclureReglees: false })),
    ]);
    this.liste = liste;
    this.dettes = dettes;
    this.afficherFournisseurs();
    this.afficherDettes();
  },

  afficherFournisseurs() {
    const corps = $('#corps-fournisseurs');
    vider(corps);
    if (this.liste.length === 0) {
      corps.append(creer('tr', {}, [creer('td', { classe: 'vide', texte: 'Aucun fournisseur.', attributs: { colspan: '5' } })]));
      return;
    }
    const peutGerer = App.peut('fournisseurs:gerer');
    for (const fournisseur of this.liste) {
      const actions = creer('td', { classe: 'nombre' });
      if (peutGerer) {
        actions.append(
          creer('button', { classe: 'bouton discret', texte: 'Dette', sur: { click: () => this.detteAnterieure(fournisseur) } }),
          creer('button', { classe: 'bouton discret espace-gauche', texte: 'Modifier', sur: { click: () => this.editer(fournisseur) } })
        );
      }
      corps.append(creer('tr', {}, [
        creer('td', { texte: fournisseur.code }),
        creer('td', { texte: fournisseur.nom }),
        creer('td', { texte: fournisseur.telephone ?? '-' }),
        creer('td', { classe: 'nombre montant dette', texte: formater(fournisseur.solde) }),
        actions,
      ]));
    }
  },

  afficherDettes() {
    const corps = $('#corps-dettes-fournisseurs');
    vider(corps);
    if (this.dettes.length === 0) {
      corps.append(creer('tr', {}, [creer('td', { classe: 'vide', texte: 'Aucune dette fournisseur ouverte.', attributs: { colspan: '5' } })]));
      return;
    }
    const peutRegler = App.peut('fournisseurs:regler');
    for (const d of this.dettes) {
      const actions = creer('td', { classe: 'nombre' });
      if (peutRegler) {
        actions.append(creer('button', { classe: 'bouton discret', texte: 'Payer', sur: { click: () => this.regler(d) } }));
      }
      corps.append(creer('tr', { classe: d.statut === 'partielle' ? 'partiel' : '' }, [
        creer('td', { texte: d.numero }),
        creer('td', { texte: d.fournisseurNom }),
        creer('td', { texte: d.libelle + (d.anterieure ? ' (anterieure)' : '') }),
        creer('td', { classe: 'nombre montant dette', texte: formater(d.solde) }),
        actions,
      ]));
    }
  },

  async editer(fournisseur) {
    if (!App.peut('fournisseurs:gerer')) {
      annoncer('Votre role ne permet pas de modifier les fournisseurs.', 'avertissement');
      return null;
    }
    const sauve = await ouvrirBoite((fermer) => {
      const champ = (nom, etiquette, attributs = {}) => {
        const entree = creer('input', { attributs: { name: nom, ...attributs } });
        return { entree, bloc: creer('label', { texte: etiquette }, [entree]) };
      };
      const erreur = creer('p', { classe: 'message erreur' });
      const code = champ('code', 'Code fournisseur (facultatif)', { type: 'text', value: fournisseur?.code ?? '' });
      const nom = champ('nom', 'Nom / raison sociale', { type: 'text', required: 'required', value: fournisseur?.nom ?? '' });
      const telephone = champ('telephone', 'Telephone', { type: 'text', value: fournisseur?.telephone ?? '' });
      const adresse = champ('adresse', 'Adresse', { type: 'text', value: fournisseur?.adresse ?? '' });
      const email = champ('email', 'Email', { type: 'email', value: fournisseur?.email ?? '' });

      const enregistrer = async () => {
        try {
          const donnees = {
            code: code.entree.value,
            nom: nom.entree.value,
            telephone: telephone.entree.value,
            adresse: adresse.entree.value,
            email: email.entree.value,
          };
          fermer(fournisseur
            ? await appeler(window.caisse.fournisseurs.modifier({ id: fournisseur.id, fournisseur: donnees }))
            : await appeler(window.caisse.fournisseurs.creer(donnees)));
        } catch (probleme) {
          afficherMessage(erreur, probleme.message);
        }
      };

      return creer('form', { sur: { submit: (e) => { e.preventDefault(); enregistrer(); } } }, [
        creer('h3', { texte: fournisseur ? 'Modifier ' + fournisseur.nom : 'Nouveau fournisseur' }),
        erreur,
        code.bloc, nom.bloc, telephone.bloc, adresse.bloc, email.bloc,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Enregistrer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (sauve) await this.charger();
    return sauve;
  },

  async choisir() {
    const fournisseurs = await appeler(window.caisse.fournisseurs.lister());
    return ouvrirBoite((fermer) => {
      const liste = creer('div', { classe: 'liste-choix' });
      if (fournisseurs.length === 0) liste.append(creer('p', { classe: 'vide compacte', texte: 'Aucun fournisseur.' }));
      for (const f of fournisseurs) {
        liste.append(creer('button', { classe: 'choix-ligne', sur: { click: () => fermer(f) } }, [
          creer('strong', { texte: f.nom }),
          creer('span', { texte: f.code + ' - a payer ' + formater(f.solde) }),
        ]));
      }
      const actions = [creer('button', { classe: 'bouton discret', texte: 'Annuler', sur: { click: () => fermer(null) } })];
      if (App.peut('fournisseurs:gerer')) {
        actions.push(creer('button', { classe: 'bouton', texte: 'Nouveau', sur: { click: async () => fermer(await this.editer(null)) } }));
      }
      return creer('div', {}, [
        creer('h3', { texte: 'Choisir le fournisseur' }),
        liste,
        creer('div', { classe: 'actions' }, actions),
      ]);
    });
  },

  async detteAnterieure(fournisseur = null) {
    if (!App.peut('fournisseurs:gerer')) {
      annoncer('Votre role ne permet pas de creer une dette fournisseur.', 'avertissement');
      return null;
    }
    if (!fournisseur) fournisseur = await this.choisir();
    if (!fournisseur) return null;
    const dette = await ouvrirBoite((fermer) => {
      const aujourdHui = new Date().toISOString().slice(0, 10);
      const montant = creer('input', { attributs: { type: 'number', min: '1', step: '1', required: 'required' } });
      const libelle = creer('input', { attributs: { type: 'text', value: 'Solde fournisseur anterieur', required: 'required' } });
      const dateOrigine = creer('input', { attributs: { type: 'date', value: aujourdHui } });
      const echeance = creer('input', { attributs: { type: 'date' } });
      const note = creer('input', { attributs: { type: 'text', placeholder: 'reference facture, bon de livraison...' } });
      const erreur = creer('p', { classe: 'message erreur' });
      return creer('form', { sur: { submit: async (e) => {
        e.preventDefault();
        try {
          fermer(await appeler(window.caisse.fournisseurs.detteAnterieure({
            fournisseurId: fournisseur.id,
            montantInitial: Number(montant.value),
            libelle: libelle.value,
            dateCreation: dateOrigine.value,
            dateEcheance: echeance.value,
            note: note.value,
          })));
        } catch (probleme) { afficherMessage(erreur, probleme.message); }
      } } }, [
        creer('h3', { texte: 'Dette anterieure - ' + fournisseur.nom }),
        erreur,
        creer('label', { texte: 'Montant a payer' }, [montant]),
        creer('label', { texte: 'Libelle' }, [libelle]),
        creer('label', { texte: 'Date d origine' }, [dateOrigine]),
        creer('label', { texte: 'Echeance' }, [echeance]),
        creer('label', { texte: 'Note' }, [note]),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Enregistrer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (dette) await this.charger();
    return dette;
  },

  async regler(dette) {
    if (!App.peut('fournisseurs:regler')) {
      annoncer('Votre role ne permet pas de regler une dette fournisseur.', 'avertissement');
      return;
    }
    const paye = await ouvrirBoite((fermer) => {
      const montant = creer('input', { attributs: { type: 'number', min: '1', max: String(dette.solde), step: '1', value: String(dette.solde), required: 'required' } });
      const mode = creer('select', {}, [
        creer('option', { texte: 'Especes', attributs: { value: 'especes' } }),
        creer('option', { texte: 'Mobile money', attributs: { value: 'mobile' } }),
        creer('option', { texte: 'Carte', attributs: { value: 'carte' } }),
      ]);
      const reference = creer('input', { attributs: { type: 'text', placeholder: 'reference paiement' } });
      const erreur = creer('p', { classe: 'message erreur' });
      return creer('form', { sur: { submit: async (e) => {
        e.preventDefault();
        try {
          fermer(await appeler(window.caisse.fournisseurs.regler({
            detteId: dette.id,
            montant: Number(montant.value),
            modePaiement: mode.value,
            reference: reference.value,
          })));
        } catch (probleme) { afficherMessage(erreur, probleme.message); }
      } } }, [
        creer('h3', { texte: 'Paiement ' + dette.numero }),
        creer('p', { texte: dette.fournisseurNom + ' - solde ' + formater(dette.solde) }),
        erreur,
        creer('label', { texte: 'Montant' }, [montant]),
        creer('label', { texte: 'Mode' }, [mode]),
        creer('label', { texte: 'Reference' }, [reference]),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Enregistrer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (paye) await this.charger();
  },
};

'use strict';

const Clients = {
  liste: [],
  creances: [],

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    if (App.utilisateur.role === 'administrateur') {
      actions.append(
        creer('button', { classe: 'bouton', texte: 'Nouveau client', sur: { click: () => this.editer(null) } }),
        creer('button', { classe: 'bouton discret espace-gauche', texte: 'Creance anterieure', sur: { click: () => this.creanceAnterieure() } })
      );
    }
    await this.charger();
  },

  async charger() {
    const [liste, creances] = await Promise.all([
      appeler(window.caisse.clients.lister()),
      appeler(window.caisse.clients.creances({ inclureReglees: false })),
    ]);
    this.liste = liste;
    this.creances = creances;
    this.afficherClients();
    this.afficherCreances();
  },

  afficherClients() {
    const corps = $('#corps-clients');
    vider(corps);
    if (this.liste.length === 0) {
      corps.append(creer('tr', {}, [creer('td', { classe: 'vide', texte: 'Aucun client.', attributs: { colspan: '5' } })]));
      return;
    }
    const admin = App.utilisateur.role === 'administrateur';
    for (const client of this.liste) {
      const actions = creer('td', { classe: 'nombre' });
      actions.append(creer('button', { classe: 'bouton discret', texte: 'Credit', sur: { click: () => this.creanceAnterieure(client) } }));
      if (admin) {
        actions.append(creer('button', { classe: 'bouton discret espace-gauche', texte: 'Modifier', sur: { click: () => this.editer(client) } }));
      }
      corps.append(creer('tr', {}, [
        creer('td', { texte: client.code }),
        creer('td', { texte: client.nom }),
        creer('td', { texte: client.telephone ?? '-' }),
        creer('td', { classe: 'nombre montant ' + (client.solde > 0 ? 'dette' : ''), texte: formater(client.solde) }),
        actions,
      ]));
    }
  },

  afficherCreances() {
    const corps = $('#corps-creances-clients');
    vider(corps);
    if (this.creances.length === 0) {
      corps.append(creer('tr', {}, [creer('td', { classe: 'vide', texte: 'Aucune creance ouverte.', attributs: { colspan: '5' } })]));
      return;
    }
    for (const c of this.creances) {
      const actions = creer('td', { classe: 'nombre' }, [
        creer('button', { classe: 'bouton discret', texte: 'Regler', sur: { click: () => this.regler(c) } }),
      ]);
      corps.append(creer('tr', { classe: c.statut === 'partielle' ? 'partiel' : '' }, [
        creer('td', { texte: c.numero }),
        creer('td', { texte: c.clientNom }),
        creer('td', { texte: c.libelle + (c.anterieure ? ' (anterieure)' : '') }),
        creer('td', { classe: 'nombre montant dette', texte: formater(c.solde) }),
        actions,
      ]));
    }
  },

  async editer(client) {
    const resultat = await ouvrirBoite((fermer) => {
      const champ = (nom, etiquette, attributs = {}) => {
        const entree = creer('input', { attributs: { name: nom, ...attributs } });
        return { entree, bloc: creer('label', { texte: etiquette }, [entree]) };
      };
      const erreur = creer('p', { classe: 'message erreur' });
      const code = champ('code', 'Code client (facultatif)', { type: 'text', value: client?.code ?? '' });
      const nom = champ('nom', 'Nom complet / raison sociale', { type: 'text', required: 'required', value: client?.nom ?? '' });
      const telephone = champ('telephone', 'Telephone', { type: 'text', value: client?.telephone ?? '' });
      const adresse = champ('adresse', 'Adresse', { type: 'text', value: client?.adresse ?? '' });
      const email = champ('email', 'Email', { type: 'email', value: client?.email ?? '' });
      const plafond = champ('plafondCredit', 'Plafond credit (0 = illimite)', { type: 'number', min: '0', step: '1', value: client?.plafondCredit ?? '0' });

      const enregistrer = async () => {
        try {
          const donnees = {
            code: code.entree.value,
            nom: nom.entree.value,
            telephone: telephone.entree.value,
            adresse: adresse.entree.value,
            email: email.entree.value,
            plafondCredit: Number(plafond.entree.value) || 0,
          };
          const sauve = client
            ? await appeler(window.caisse.clients.modifier({ id: client.id, client: donnees }))
            : await appeler(window.caisse.clients.creer(donnees));
          fermer(sauve);
        } catch (erreur_) {
          afficherMessage(erreur, erreur_.message);
        }
      };

      return creer('form', { sur: { submit: (e) => { e.preventDefault(); enregistrer(); } } }, [
        creer('h3', { texte: client ? 'Modifier ' + client.nom : 'Nouveau client' }),
        erreur,
        code.bloc, nom.bloc, telephone.bloc, adresse.bloc, email.bloc, plafond.bloc,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Enregistrer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (resultat) await this.charger();
    return resultat;
  },

  async choisir() {
    const clients = await appeler(window.caisse.clients.lister());
    if (clients.length === 0 && App.utilisateur.role === 'administrateur') {
      const nouveau = await this.editer(null);
      return nouveau;
    }
    return ouvrirBoite((fermer) => {
      const recherche = creer('input', { attributs: { type: 'search', placeholder: 'Rechercher un client', autocomplete: 'off' } });
      const liste = creer('div', { classe: 'liste-choix' });
      const dessiner = () => {
        vider(liste);
        const texte = recherche.value.trim().toLowerCase();
        const filtres = clients.filter((c) => !texte || c.nom.toLowerCase().includes(texte) || c.code.toLowerCase().includes(texte));
        if (filtres.length === 0) liste.append(creer('p', { classe: 'vide compacte', texte: 'Aucun client.' }));
        for (const c of filtres) {
          liste.append(creer('button', { classe: 'choix-ligne', sur: { click: () => fermer(c) } }, [
            creer('strong', { texte: c.nom }),
            creer('span', { texte: c.code + ' - solde ' + formater(c.solde) }),
          ]));
        }
      };
      recherche.addEventListener('input', dessiner);
      const actions = [creer('button', { classe: 'bouton discret', texte: 'Annuler', sur: { click: () => fermer(null) } })];
      if (App.utilisateur.role === 'administrateur') {
        actions.push(creer('button', {
          classe: 'bouton', texte: 'Nouveau',
          sur: { click: async () => fermer(await this.editer(null)) },
        }));
      }
      const boite = creer('div', {}, [
        creer('h3', { texte: 'Choisir le client' }),
        recherche,
        liste,
        creer('div', { classe: 'actions' }, actions),
      ]);
      dessiner();
      return boite;
    });
  },

  async creanceAnterieure(client = null) {
    if (!client) client = await this.choisir();
    if (!client) return null;
    const cree = await ouvrirBoite((fermer) => {
      const aujourdHui = new Date().toISOString().slice(0, 10);
      const montant = creer('input', { attributs: { type: 'number', min: '1', step: '1', required: 'required' } });
      const libelle = creer('input', { attributs: { type: 'text', value: 'Solde anterieur', required: 'required' } });
      const dateOrigine = creer('input', { attributs: { type: 'date', value: aujourdHui } });
      const echeance = creer('input', { attributs: { type: 'date' } });
      const note = creer('input', { attributs: { type: 'text', placeholder: 'reference facture, observation...' } });
      const erreur = creer('p', { classe: 'message erreur' });
      return creer('form', { sur: { submit: async (e) => {
        e.preventDefault();
        try {
          fermer(await appeler(window.caisse.clients.creanceAnterieure({
            clientId: client.id,
            montantInitial: Number(montant.value),
            libelle: libelle.value,
            dateCreation: dateOrigine.value,
            dateEcheance: echeance.value,
            note: note.value,
          })));
        } catch (probleme) { afficherMessage(erreur, probleme.message); }
      } } }, [
        creer('h3', { texte: 'Creance anterieure - ' + client.nom }),
        erreur,
        creer('label', { texte: 'Montant restant du' }, [montant]),
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
    if (cree) await this.charger();
    return cree;
  },

  async regler(creance) {
    const regle = await ouvrirBoite((fermer) => {
      const montant = creer('input', { attributs: { type: 'number', min: '1', max: String(creance.solde), step: '1', value: String(creance.solde), required: 'required' } });
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
          fermer(await appeler(window.caisse.clients.regler({
            creanceId: creance.id,
            montant: Number(montant.value),
            modePaiement: mode.value,
            reference: reference.value,
          })));
        } catch (probleme) { afficherMessage(erreur, probleme.message); }
      } } }, [
        creer('h3', { texte: 'Reglement ' + creance.numero }),
        creer('p', { texte: creance.clientNom + ' - solde ' + formater(creance.solde) }),
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
    if (regle) await this.charger();
  },
};

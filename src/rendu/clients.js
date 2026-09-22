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
    this.afficherResume();
    this.afficherClients();
    this.afficherCreances();
  },

  afficherResume() {
    const zone = $('#resume-clients');
    if (!zone) return;
    vider(zone);
    const totalClients = this.liste.length;
    const clientsDebiteurs = this.liste.filter((c) => c.solde > 0).length;
    const totalSolde = this.liste.reduce((s, c) => s + c.solde, 0);
    const plusGrosDebiteur = [...this.liste].sort((a, b) => b.solde - a.solde)[0];
    const cartes = [
      {
        etiquette: 'Clients actifs',
        valeur: String(totalClients),
        detail: clientsDebiteurs + ' debiteur(s)',
        classe: 'clients',
      },
      {
        etiquette: 'Dette ouverte',
        valeur: formater(totalSolde),
        detail: this.creances.length + ' facture(s) a suivre',
        classe: totalSolde > 0 ? 'dette' : 'sain',
      },
      {
        etiquette: 'Plus gros solde',
        valeur: plusGrosDebiteur && plusGrosDebiteur.solde > 0 ? plusGrosDebiteur.nom : 'Aucun',
        detail: plusGrosDebiteur && plusGrosDebiteur.solde > 0 ? formater(plusGrosDebiteur.solde) : 'Portefeuille sain',
        classe: plusGrosDebiteur && plusGrosDebiteur.solde > 0 ? 'alerte' : 'sain',
      },
    ];
    for (const carte of cartes) {
      zone.append(creer('div', { classe: 'client-kpi ' + carte.classe }, [
        creer('span', { texte: carte.etiquette }),
        creer('strong', { texte: carte.valeur }),
        creer('small', { texte: carte.detail }),
      ]));
    }
  },

  afficherClients() {
    const corps = $('#corps-clients');
    const compteur = $('#compteur-clients');
    if (compteur) compteur.textContent = this.liste.length + ' client' + (this.liste.length > 1 ? 's' : '');
    vider(corps);
    if (this.liste.length === 0) {
      corps.append(creer('tr', {}, [creer('td', { classe: 'vide', texte: 'Aucun client.', attributs: { colspan: '5' } })]));
      return;
    }
    const admin = App.utilisateur.role === 'administrateur';
    for (const client of this.liste) {
      const actions = creer('td', { classe: 'actions-ligne' });
      actions.append(creer('button', { classe: 'bouton discret bouton-mini bouton-credit', texte: 'Credit', sur: { click: () => this.creanceAnterieure(client) } }));
      if (admin) {
        actions.append(creer('button', { classe: 'bouton discret bouton-mini', texte: 'Modifier', sur: { click: () => this.editer(client) } }));
      }
      const statut = client.solde > 0 ? 'debiteur' : 'a-jour';
      corps.append(creer('tr', { classe: 'client-row ' + statut }, [
        creer('td', { classe: 'client-code' }, [creer('span', { classe: 'badge-code', texte: client.code })]),
        creer('td', { classe: 'client-identite' }, [
          creer('strong', { texte: client.nom }),
          creer('span', { texte: client.solde > 0 ? 'Credit ouvert' : 'A jour' }),
        ]),
        creer('td', { classe: 'telephone-client', texte: client.telephone ?? '-' }),
        creer('td', { classe: 'nombre' }, [
          creer('span', { classe: 'solde-badge ' + (client.solde > 0 ? 'dette' : 'neutre'), texte: formater(client.solde) }),
        ]),
        actions,
      ]));
    }
  },

  afficherCreances() {
    const corps = $('#corps-creances-clients');
    const compteur = $('#compteur-creances-clients');
    if (compteur) compteur.textContent = this.creances.length + ' creance' + (this.creances.length > 1 ? 's' : '');
    vider(corps);
    if (this.creances.length === 0) {
      corps.append(creer('tr', {}, [creer('td', { classe: 'vide', texte: 'Aucune creance ouverte.', attributs: { colspan: '5' } })]));
      return;
    }
    for (const c of this.creances) {
      const actions = creer('td', { classe: 'actions-ligne' }, [
        creer('button', { classe: 'bouton discret bouton-mini bouton-detail', texte: 'Details', sur: { click: () => this.detailsCreance(c) } }),
        creer('button', { classe: 'bouton discret bouton-mini bouton-regler', texte: 'Regler', sur: { click: () => this.regler(c) } }),
      ]);
      const libelle = c.libelle + (c.anterieure ? ' (anterieure)' : '');
      corps.append(creer('tr', { classe: 'creance-row ' + (c.statut === 'partielle' ? 'partiel' : '') }, [
        creer('td', { classe: 'numero-creance' }, [creer('span', { classe: 'numero-document', texte: c.numero })]),
        creer('td', { classe: 'client-creance' }, [creer('strong', { texte: c.clientNom })]),
        creer('td', { classe: 'creance-libelle' }, [
          creer('strong', { texte: libelle }),
          creer('span', { texte: c.statut === 'partielle' ? 'Reglement partiel' : 'En attente de reglement' }),
        ]),
        creer('td', { classe: 'nombre' }, [creer('span', { classe: 'solde-badge dette', texte: formater(c.solde) })]),
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

  dateCourte(date) {
    return String(date ?? '').slice(0, 16).replace('T', ' ');
  },

  ligneDetail(etiquette, valeur, classe = '') {
    return creer('div', { classe: 'facture-detail-ligne ' + classe }, [
      creer('span', { texte: etiquette }),
      creer('strong', { texte: valeur }),
    ]);
  },

  async detailsCreance(creanceCourte) {
    const detail = await appeler(window.caisse.clients.creance({ id: creanceCourte.id }));
    const creance = detail.creance;
    await ouvrirBoite((fermer) => {
      const dejaRegle = Math.max(0, creance.montantInitial - creance.solde);
      const lignesVente = creer('div', { classe: 'facture-lignes-vente' });
      if (detail.vente?.panier?.lignes?.length) {
        for (const l of detail.vente.panier.lignes) {
          const retour = l.quantiteRetournee > 0
            ? ' — retourne ' + l.quantiteRetournee + ' ' + libelleUnite(l.uniteVente, l.quantiteRetournee)
            : '';
          lignesVente.append(creer('div', { classe: 'facture-ligne-article' }, [
            creer('div', {}, [
              creer('strong', { texte: l.designation }),
              creer('span', { texte: l.quantite + ' ' + libelleUnite(l.uniteVente, l.quantite) + ' x ' + formater(l.prixUnitaire) + retour }),
            ]),
            creer('span', { classe: 'montant', texte: formater(l.totalTtc) }),
          ]));
        }
      } else {
        lignesVente.append(creer('p', { classe: 'vide compacte', texte: 'Creance saisie sans detail de vente dans la caisse.' }));
      }

      const reglements = creer('div', { classe: 'facture-reglements' });
      if (detail.reglements.length === 0) {
        reglements.append(creer('p', { classe: 'vide compacte', texte: 'Aucun reglement deja enregistre.' }));
      } else {
        for (const r of detail.reglements) {
          reglements.append(creer('div', { classe: 'facture-reglement' }, [
            creer('div', {}, [
              creer('strong', { texte: this.dateCourte(r.date) + ' — ' + (LIBELLES_PAIEMENT[r.modePaiement] ?? r.modePaiement) }),
              creer('span', { texte: r.reference ? 'Ref. ' + r.reference : (r.note || 'Reglement client') }),
            ]),
            creer('span', { classe: 'montant', texte: formater(r.montant) }),
          ]));
        }
      }

      const ouvrirReglement = async () => {
        fermer(null);
        await this.regler(creance);
      };

      return creer('div', { classe: 'facture-detail' }, [
        creer('div', { classe: 'facture-detail-entete' }, [
          creer('div', {}, [
            creer('span', { classe: 'libelle-doux', texte: 'Facture credit client' }),
            creer('h3', { texte: creance.numero }),
            creer('p', { classe: 'aide', texte: creance.clientNom + ' — ' + creance.libelle }),
          ]),
          creer('span', { classe: 'solde-badge dette', texte: formater(creance.solde) }),
        ]),
        creer('div', { classe: 'facture-resume' }, [
          this.ligneDetail('Montant facture', formater(creance.montantInitial)),
          this.ligneDetail('Deja regle', formater(dejaRegle)),
          this.ligneDetail('Reste a payer', formater(creance.solde), 'important'),
          this.ligneDetail('Statut', creance.statut),
          this.ligneDetail('Date', this.dateCourte(creance.dateCreation)),
          this.ligneDetail('Echeance', creance.dateEcheance ? this.dateCourte(creance.dateEcheance) : '-'),
        ]),
        detail.vente ? creer('p', { classe: 'aide', texte: 'Ticket lie : ' + detail.vente.numero + ' — total ' + formater(detail.vente.panier.totalTtc) + (detail.vente.totalRetours > 0 ? ' — retours ' + formater(detail.vente.totalRetours) : '') }) : creer('span'),
        creer('h3', { texte: 'Articles de la facture' }),
        lignesVente,
        creer('h3', { texte: 'Reglements deja effectues' }),
        reglements,
        creance.note ? creer('p', { classe: 'aide', texte: 'Note : ' + creance.note }) : creer('span'),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Fermer', sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: creance.solde > 0 ? 'Regler total ou partiel' : 'Deja reglee', attributs: { type: 'button' }, sur: { click: creance.solde > 0 ? ouvrirReglement : () => {} } }),
        ]),
      ]);
    });
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
        creer('p', { classe: 'aide', texte: 'Pour regler totalement, gardez le solde complet. Pour un reglement partiel, saisissez seulement le montant verse.' }),
        erreur,
        creer('label', { texte: 'Montant a encaisser' }, [montant]),
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

'use strict';

/* Journal du jour et cloture de caisse. La cloture est la somme des ventes non
   annulees, ventilee par mode de paiement et par taux de TVA : c'est le chiffre
   que le commercant compare a ce qu'il a dans le tiroir. */

function ligneSession(etiquette, valeur, classe = '') {
  return creer('div', { classe: 'ligne-cloture ' + classe }, [
    creer('span', { texte: etiquette }),
    creer('span', { classe: 'montant', texte: valeur }),
  ]);
}

const Journal = {
  jour: null,

  async activer() {
    if (!this.jour) this.jour = new Date().toISOString().slice(0, 10);

    const actions = $('#actions-vue');
    vider(actions);
    const champ = creer('input', {
      attributs: { type: 'date', value: this.jour },
      sur: { change: (e) => { this.jour = e.target.value; this.charger(); } },
    });
    actions.append(
      creer('label', { classe: 'etiquette-en-ligne', texte: 'Journee' }, [champ]),
      creer('button', { classe: 'bouton discret espace-gauche', texte: 'Ouvrir / fermer', sur: { click: () => this.actionCaisse() } })
    );

    await this.charger();
  },

  async charger() {
    const [ventes, cloture, etatCaisse] = await Promise.all([
      appeler(window.caisse.ventes.journal({ jour: this.jour })),
      appeler(window.caisse.ventes.cloture({ jour: this.jour })),
      appeler(window.caisse.caisseJournee.etat()),
    ]);
    this.afficherSession(etatCaisse);
    this.afficherVentes(ventes);
    this.afficherCloture(cloture);
  },

  afficherSession(etat) {
    const panneau = $('#panneau-session-caisse');
    vider(panneau);
    panneau.append(creer('h3', { texte: 'Ouverture / fermeture' }));

    if (!etat.ouverte) {
      panneau.append(
        creer('p', { texte: 'La caisse est fermee. Aucune vente ne peut etre encaissee tant qu elle n est pas ouverte.' }),
        creer('button', { classe: 'bouton pleine-largeur', texte: 'Ouvrir la caisse', sur: { click: () => this.ouvrirCaisse() } })
      );
      return;
    }

    const r = etat.resume;
    panneau.append(
      creer('div', { classe: 'badge-session ouvert', texte: 'Ouverte depuis ' + heureDe(etat.session.ouverteLe) + ' par ' + etat.session.ouvertPar }),
      ligneSession('Fond ouverture', formater(etat.session.fondOuverture)),
      ligneSession('Especes theoriques en tiroir', formater(r.totalTheorique), 'forte'),
      ligneSession('Ventes encaissees', formater(r.ventesEncaissees)),
      ligneSession('Ventes a credit', formater(r.ventesCredit)),
      ligneSession('Reglements clients', formater(r.entreesCreances)),
      ligneSession('Paiements fournisseurs', '-' + formater(r.sortiesFournisseurs)),
      r.sortiesRetoursClients > 0 ? ligneSession('Retours clients rembourses', '-' + formater(r.sortiesRetoursClients)) : creer('span'),
      creer('button', { classe: 'bouton danger pleine-largeur espace-haut', texte: 'Fermer la caisse', sur: { click: () => this.fermerCaisse(r) } })
    );
  },

  async actionCaisse() {
    const etat = await appeler(window.caisse.caisseJournee.etat());
    if (etat.ouverte) await this.fermerCaisse(etat.resume);
    else await this.ouvrirCaisse();
  },

  async ouvrirCaisse() {
    const ouverte = await ouvrirBoite((fermer) => {
      const fond = creer('input', { attributs: { type: 'number', min: '0', step: '5', value: '0', required: 'required' } });
      const note = creer('input', { attributs: { type: 'text', placeholder: 'observation optionnelle' } });
      const erreur = creer('p', { classe: 'message erreur' });
      return creer('form', { sur: { submit: async (e) => {
        e.preventDefault();
        try {
          fermer(await appeler(window.caisse.caisseJournee.ouvrir({
            fondOuverture: Number(fond.value) || 0,
            note: note.value,
          })));
        } catch (probleme) { afficherMessage(erreur, probleme.message); }
      } } }, [
        creer('h3', { texte: 'Ouvrir la caisse' }),
        erreur,
        creer('label', { texte: 'Fond de caisse au depart' }, [fond]),
        creer('label', { texte: 'Note' }, [note]),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Ouvrir', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (ouverte) await this.charger();
    return ouverte;
  },

  async fermerCaisse(resume = null) {
    if (!resume) resume = (await appeler(window.caisse.caisseJournee.etat())).resume;
    const fermee = await ouvrirBoite((fermer) => {
      const fond = creer('input', { attributs: { type: 'number', min: '0', step: '5', value: String(resume.totalTheorique), required: 'required' } });
      const note = creer('input', { attributs: { type: 'text', placeholder: 'ecart explique, observation...' } });
      const ecart = creer('p', { classe: 'message visible succes', texte: 'Ecart prevu : 0 F' });
      const erreur = creer('p', { classe: 'message erreur' });
      const recalculer = () => {
        const difference = (Number(fond.value) || 0) - resume.totalTheorique;
        afficherMessage(ecart, 'Ecart prevu : ' + formater(difference), difference === 0 ? 'succes' : 'erreur');
      };
      fond.addEventListener('input', recalculer);
      return creer('form', { sur: { submit: async (e) => {
        e.preventDefault();
        try {
          fermer(await appeler(window.caisse.caisseJournee.fermer({
            fondFermeture: Number(fond.value) || 0,
            note: note.value,
          })));
        } catch (probleme) { afficherMessage(erreur, probleme.message); }
      } } }, [
        creer('h3', { texte: 'Fermer la caisse' }),
        creer('p', { texte: 'Especes theoriques : ' + formater(resume.totalTheorique) }),
        erreur,
        creer('label', { texte: 'Especes comptees' }, [fond]),
        ecart,
        creer('label', { texte: 'Note de fermeture' }, [note]),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton danger', texte: 'Fermer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
    if (fermee) await this.charger();
    return fermee;
  },

  afficherVentes(ventes) {
    const corps = $('#corps-journal');
    vider(corps);

    if (ventes.length === 0) {
      corps.append(creer('tr', {}, [
        creer('td', { classe: 'vide', texte: 'Aucune vente ce jour-la.', attributs: { colspan: '7' } }),
      ]));
      return;
    }

    for (const vente of ventes) {
      const actions = creer('td', { classe: 'nombre' }, [
        creer('button', {
          classe: 'bouton discret', texte: 'Ticket',
          sur: { click: () => this.voirTicket(vente.id) },
        }),
      ]);
      if (App.utilisateur.role === 'administrateur' && !vente.annulee) {
        actions.append(creer('button', {
          classe: 'bouton discret espace-gauche', texte: 'Retour',
          sur: { click: () => this.retourner(vente) },
        }));
        actions.append(creer('button', {
          classe: 'bouton discret espace-gauche', texte: 'Annuler',
          sur: { click: () => this.annuler(vente) },
        }));
      }

      corps.append(creer('tr', { classe: vente.annulee ? 'annulee' : '' }, [
        creer('td', { texte: vente.numero }),
        creer('td', { texte: heureDe(vente.date) }),
        creer('td', { texte: vente.caissier }),
        creer('td', { texte: (LIBELLES_PAIEMENT[vente.modePaiement] ?? vente.modePaiement) + (vente.clientNom ? ' - ' + vente.clientNom : '') }),
        creer('td', { classe: 'nombre montant', texte: formater(vente.totalTtc) }),
        creer('td', { classe: 'nombre montant retour-client-montant', texte: vente.totalRetours > 0 ? formater(vente.totalRetours) : '-' }),
        actions,
      ]));
    }
  },

  afficherCloture(z) {
    const panneau = $('#panneau-cloture');
    vider(panneau);

    const ligne = (etiquette, valeur, classe = '') =>
      creer('div', { classe: 'ligne-cloture ' + classe }, [
        creer('span', { texte: etiquette }),
        creer('span', { classe: 'montant', texte: valeur }),
      ]);

    panneau.append(creer('h3', { texte: 'Cloture du ' + z.jour }));
    panneau.append(ligne('Ventes', String(z.nombreVentes)));
    panneau.append(ligne('Chiffre d affaires', formater(z.totalTtc), 'forte'));
    if (z.totalRetoursClients > 0) {
      panneau.append(ligne('Retours clients', '-' + formater(z.totalRetoursClients)));
      panneau.append(ligne('Chiffre net', formater(z.chiffreAffairesNet), 'forte'));
    }
    panneau.append(ligne('Total encaisse', formater(z.totalEncaisse ?? z.totalTtc)));
    if (z.totalRetoursRembourses > 0) panneau.append(ligne('Remboursements clients', '-' + formater(z.totalRetoursRembourses)));
    if (z.totalCredit > 0) panneau.append(ligne('Ventes a credit', formater(z.totalCredit)));
    if (z.totalRetoursDeduitsCreances > 0) panneau.append(ligne('Retours deduits credits', '-' + formater(z.totalRetoursDeduitsCreances)));
    if (z.totalAvoirsClients > 0) panneau.append(ligne('Avoirs clients', formater(z.totalAvoirsClients)));

    if (z.remise > 0) panneau.append(ligne('Remises accordees', '-' + formater(z.remise)));
    if (z.ventesAnnulees > 0) panneau.append(ligne('Ventes annulees', String(z.ventesAnnulees)));

    if (z.parPaiement.length > 0) {
      panneau.append(creer('h3', { classe: 'espace-haut', texte: 'Par mode de paiement' }));
      for (const p of z.parPaiement) {
        panneau.append(ligne(LIBELLES_PAIEMENT[p.mode] + ' (' + p.nombre + ')', formater(p.ttc)));
      }
    }

    if (z.parTaux.length > 0) {
      panneau.append(creer('h3', { classe: 'espace-haut', texte: 'TVA collectee' }));
      for (const t of z.parTaux) {
        panneau.append(ligne('Base HT ' + t.taux + ' %', formater(t.base)));
        panneau.append(ligne('TVA ' + t.taux + ' %', formater(t.tva)));
      }
      panneau.append(ligne('Total TVA', formater(z.totalTva), 'forte'));
    }
  },

  async retourner(venteCourte) {
    const vente = await appeler(window.caisse.ventes.lire({ id: venteCourte.id }));
    const lignesDisponibles = vente.panier.lignes.filter((l) => l.quantiteRetourable > 0);
    if (lignesDisponibles.length === 0) {
      return ouvrirBoite((fermer) => creer('div', {}, [
        creer('h3', { texte: 'Aucun retour possible' }),
        creer('p', { texte: 'Toutes les marchandises de cette vente ont deja ete retournees.' }),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ]));
    }

    const retour = await ouvrirBoite((fermer) => {
      const erreur = creer('p', { classe: 'message erreur' });
      const date = creer('input', { attributs: { type: 'date', value: new Date().toISOString().slice(0, 10), required: 'required' } });
      const reference = creer('input', { attributs: { type: 'text', placeholder: 'numero avoir / bon retour' } });
      const mode = creer('select', {}, [
        creer('option', { texte: 'Avoir client / pas de sortie caisse', attributs: { value: 'avoir' } }),
        creer('option', { texte: 'Remboursement especes', attributs: { value: 'especes' } }),
        creer('option', { texte: 'Remboursement mobile money', attributs: { value: 'mobile' } }),
        creer('option', { texte: 'Remboursement carte', attributs: { value: 'carte' } }),
      ]);
      const note = creer('input', { attributs: { type: 'text', placeholder: 'motif, observation...' } });
      const lignesZone = creer('div', { classe: 'lignes-retour-client' });
      const totalZone = creer('div', { classe: 'total-retour-client' });
      const champs = new Map();

      const recalculer = () => {
        let total = 0;
        let pieces = 0;
        for (const l of lignesDisponibles) {
          const q = Number(champs.get(l.id).value) || 0;
          if (q === l.quantiteRetourable) total += l.totalRetourable;
          else total += Math.min(l.totalRetourable, Math.round((l.totalTtc * q) / l.quantite));
          pieces += q * l.facteurStock;
        }
        totalZone.textContent = 'Retour client : ' + formater(total) + ' — Entree stock : ' + pieces + ' piece(s)';
      };

      for (const l of lignesDisponibles) {
        const quantite = creer('input', {
          attributs: {
            type: 'number', min: '0', max: String(l.quantiteRetourable), step: '1', value: '0',
          },
          sur: { input: recalculer },
        });
        champs.set(l.id, quantite);
        lignesZone.append(creer('div', { classe: 'ligne-retour-client' }, [
          creer('div', {}, [
            creer('strong', { texte: l.designation }),
            creer('span', { texte: 'Vendu : ' + l.quantite + ' ' + libelleUnite(l.uniteVente, l.quantite) + ' — deja retourne : ' + l.quantiteRetournee }),
            creer('span', { texte: 'Retour possible : ' + l.quantiteRetourable + ' ' + libelleUnite(l.uniteVente, l.quantiteRetourable) + ' (' + formaterStock(l.quantiteStockRetourable, l) + ')' }),
          ]),
          creer('span', { classe: 'montant', texte: 'Reste ' + formater(l.totalRetourable) }),
          creer('label', { texte: 'Quantite retour' }, [quantite]),
        ]));
      }

      const enregistrer = async () => {
        const lignes = lignesDisponibles.map((l) => ({
          ligneVenteId: l.id,
          quantite: Number(champs.get(l.id).value) || 0,
        })).filter((l) => l.quantite > 0);
        if (lignes.length === 0) return afficherMessage(erreur, 'Indiquez au moins une quantite a retourner.');
        try {
          fermer(await appeler(window.caisse.ventes.retourner({
            venteId: vente.id,
            dateRetour: date.value,
            referenceDocument: reference.value,
            modeRemboursement: mode.value,
            note: note.value,
            lignes,
          })));
        } catch (probleme) {
          afficherMessage(erreur, probleme.message);
        }
      };

      recalculer();
      const aide = vente.paiement.mode === 'credit'
        ? 'La dette client sera diminuee automatiquement. Si la dette est deja reglee, le reste sera traite selon le mode choisi.'
        : 'Le stock sera augmente. Choisissez avoir client ou remboursement ; le remboursement especes sortira de la caisse ouverte.';
      return creer('form', {
        classe: 'formulaire-retour-client',
        sur: { submit: (e) => { e.preventDefault(); enregistrer(); } },
      }, [
        creer('h3', { texte: 'Retour client - ' + vente.numero }),
        creer('p', { classe: 'aide', texte: aide }),
        erreur,
        creer('div', { classe: 'grille-formulaire' }, [
          creer('label', { texte: 'Date retour' }, [date]),
          creer('label', { texte: 'Document / avoir' }, [reference]),
          creer('label', { texte: 'Mode' }, [mode]),
          creer('label', { texte: 'Note' }, [note]),
        ]),
        lignesZone,
        totalZone,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Valider le retour', attributs: { type: 'submit' } }),
        ]),
      ]);
    });

    if (retour) {
      await this.charger();
      await ouvrirBoite((fermer) => creer('div', {}, [
        creer('h3', { texte: 'Retour enregistre' }),
        creer('p', { texte: retour.numero + ' — montant ' + formater(retour.totalTtc) }),
        creer('p', { classe: 'aide', texte: retour.montantDeduitCreance > 0 ? 'Deduit de la dette client : ' + formater(retour.montantDeduitCreance) : (retour.montantRembourse > 0 ? 'Rembourse : ' + formater(retour.montantRembourse) : 'Avoir client : ' + formater(retour.montantAvoir)) }),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ]));
    }
    return retour;
  },

  async voirTicket(id) {
    const vente = await appeler(window.caisse.ventes.lire({ id }));
    await ouvrirBoite((fermer) =>
      creer('div', {}, [
        creer('h3', { texte: 'Ticket ' + vente.numero + (vente.annulee ? ' (annulee)' : '') }),
        creer('pre', { classe: 'ticket', texte: apercuTicket(vente) }),
        creer('div', { classe: 'actions' }, [
          creer('button', {
            classe: 'bouton discret', texte: 'Imprimer',
            sur: {
              click: async (e) => {
                e.target.disabled = true;
                try { await appeler(window.caisse.ticket.imprimer({ id })); }
                catch (erreur) { e.target.textContent = erreur.message; }
                finally { e.target.disabled = false; }
              },
            },
          }),
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ])
    );
  },

  async annuler(vente) {
    const motif = await ouvrirBoite((fermer) => {
      const champ = creer('input', { attributs: { type: 'text', placeholder: 'erreur de saisie, retour client...' } });
      return creer('form', { sur: { submit: (e) => { e.preventDefault(); fermer(champ.value); } } }, [
        creer('h3', { texte: 'Annuler la vente ' + vente.numero + ' ?' }),
        creer('p', { texte: 'Les articles retournent en stock. La vente reste au journal, barree.' }),
        creer('label', { texte: 'Motif' }, [champ]),
        creer('div', { classe: 'actions' }, [
          creer('button', {
            classe: 'bouton discret', texte: 'Renoncer',
            attributs: { type: 'button' }, sur: { click: () => fermer(null) },
          }),
          creer('button', { classe: 'bouton danger', texte: 'Annuler la vente', attributs: { type: 'submit' } }),
        ]),
      ]);
    });

    if (motif === null) return;
    await appeler(window.caisse.ventes.annuler({ id: vente.id, motif }));
    await this.charger();
  },
};

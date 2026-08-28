'use strict';

/* Journal du jour et cloture de caisse. La cloture est la somme des ventes non
   annulees, ventilee par mode de paiement et par taux de TVA : c'est le chiffre
   que le commercant compare a ce qu'il a dans le tiroir. */

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
    actions.append(creer('label', { classe: 'etiquette-en-ligne', texte: 'Journee' }, [champ]));

    await this.charger();
  },

  async charger() {
    const [ventes, cloture] = await Promise.all([
      appeler(window.caisse.ventes.journal({ jour: this.jour })),
      appeler(window.caisse.ventes.cloture({ jour: this.jour })),
    ]);
    this.afficherVentes(ventes);
    this.afficherCloture(cloture);
  },

  afficherVentes(ventes) {
    const corps = $('#corps-journal');
    vider(corps);

    if (ventes.length === 0) {
      corps.append(creer('tr', {}, [
        creer('td', { classe: 'vide', texte: 'Aucune vente ce jour-la.', attributs: { colspan: '5' } }),
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
          classe: 'bouton discret espace-gauche', texte: 'Annuler',
          sur: { click: () => this.annuler(vente) },
        }));
      }

      corps.append(creer('tr', { classe: vente.annulee ? 'annulee' : '' }, [
        creer('td', { texte: vente.numero }),
        creer('td', { texte: heureDe(vente.date) }),
        creer('td', { texte: vente.caissier }),
        creer('td', { classe: 'nombre montant', texte: formater(vente.totalTtc) }),
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
    panneau.append(ligne('Total encaisse', formater(z.totalTtc), 'forte'));

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

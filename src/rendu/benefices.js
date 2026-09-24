'use strict';

const Benefices = {
  depuis: '',
  jusqua: '',
  achatId: '',

  async activer() {
    this.rendreActions([]);
    await this.charger();
  },

  rendreActions(facturesDisponibles = []) {
    const actions = $('#actions-vue');
    vider(actions);

    const depuis = creer('input', {
      attributs: { type: 'date', value: this.depuis },
      sur: { change: (e) => {
        this.depuis = e.target.value;
        this.achatId = '';
        this.charger();
      } },
    });
    const jusqua = creer('input', {
      attributs: { type: 'date', value: this.jusqua },
      sur: { change: (e) => {
        this.jusqua = e.target.value;
        this.achatId = '';
        this.charger();
      } },
    });

    const facture = creer('select', {
      attributs: { 'aria-label': "Choisir une facture d'achat" },
      sur: { change: (e) => { this.achatId = e.target.value; this.charger(); } },
    });
    facture.append(creer('option', { attributs: { value: '' }, texte: "Toutes les factures d'achat" }));
    for (const option of facturesDisponibles) {
      facture.append(creer('option', {
        attributs: { value: String(option.id) },
        texte: option.libelle || [option.numero, option.fournisseurNom].filter(Boolean).join(' - '),
      }));
    }
    facture.value = this.achatId || '';

    actions.append(
      creer('label', { classe: 'etiquette-en-ligne selection-facture-benefice', texte: 'Facture' }, [facture]),
      creer('label', { classe: 'etiquette-en-ligne espace-gauche', texte: 'Achats du' }, [depuis]),
      creer('label', { classe: 'etiquette-en-ligne espace-gauche', texte: 'au' }, [jusqua]),
      creer('button', { classe: 'bouton discret espace-gauche', texte: 'Actualiser', sur: { click: () => this.charger() } })
    );
  },

  async charger() {
    const donnees = await appeler(window.caisse.benefices.lister({
      depuis: this.depuis || null,
      jusqua: this.jusqua || null,
      achatId: this.achatId ? Number(this.achatId) : null,
    }));

    const disponibles = donnees.facturesDisponibles || [];
    const existe = disponibles.some((facture) => String(facture.id) === String(this.achatId));
    if (this.achatId && !existe) {
      this.achatId = '';
      return this.charger();
    }

    this.rendreActions(disponibles);
    this.afficher(donnees);
  },

  pourcentage(valeur) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Number(valeur) || 0) + ' %';
  },

  carte(titre, valeur, detail, classe = '') {
    return creer('div', { classe: 'benefice-kpi ' + classe }, [
      creer('span', { texte: titre }),
      creer('strong', { texte: valeur }),
      creer('small', { texte: detail ?? '' }),
    ]);
  },

  afficher({ resume, factures, selection }) {
    const zone = $('#contenu-benefices');
    vider(zone);

    const factureSelectionnee = Boolean(selection?.achatId || this.achatId);
    const detailSelection = factureSelectionnee
      ? 'La facture choisie dans le menu deroulant est affichee seule.'
      : "Toutes les factures d'achat avec articles vendus sont affichees.";

    zone.append(creer('section', { classe: 'benefices-hero' }, [
      creer('div', {}, [
        creer('span', { classe: 'libelle-doux', texte: 'Rentabilite reelle' }),
        creer('h3', { texte: 'Benefice par article vendu et par facture d achat' }),
        creer('p', {
          classe: 'aide',
          texte: "Chaque ligne apparait uniquement si l'article achete a effectivement ete vendu. Le benefice est calcule a partir du cout d'achat de la facture et du chiffre d'affaires vendu.",
        }),
        creer('p', { classe: 'aide benefices-selection-info', texte: detailSelection }),
      ]),
      creer('div', { classe: 'benefices-kpis' }, [
        this.carte('Chiffre vendu', formater(resume.chiffreAffaires), resume.lignes + ' article(s) vendu(s)', 'ca'),
        this.carte('Cout achat', formater(resume.coutAchat), resume.factures + ' facture(s)', 'cout'),
        this.carte('Benefice', formater(resume.benefice), 'Marge ' + this.pourcentage(resume.margePourcent), resume.benefice >= 0 ? 'gain' : 'perte'),
      ]),
    ]));

    if (factures.length === 0) {
      zone.append(creer('div', { classe: 'panneau benefices-vide' }, [
        creer('h3', { texte: 'Aucun benefice a afficher' }),
        creer('p', { classe: 'aide', texte: factureSelectionnee
          ? "La facture d'achat choisie ne contient aucun article vendu pour le moment."
          : "Aucun article des factures d'achat selectionnees n'a encore ete vendu." }),
      ]));
      return;
    }

    for (const facture of factures) {
      const corps = creer('tbody');
      for (const ligne of facture.lignes) {
        corps.append(creer('tr', {}, [
          creer('td', {}, [
            creer('strong', { texte: ligne.designation }),
            creer('span', { classe: 'sous-ligne', texte: ligne.reference }),
          ]),
          creer('td', { texte: ligne.quantiteStockNetteLibelle }),
          creer('td', { texte: ligne.quantiteStockVendueLibelle }),
          creer('td', { classe: 'nombre montant', texte: formater(ligne.coutAchat) }),
          creer('td', { classe: 'nombre montant', texte: formater(ligne.chiffreAffaires) }),
          creer('td', { classe: 'nombre montant benefice-valeur ' + (ligne.benefice >= 0 ? 'positif' : 'negatif'), texte: formater(ligne.benefice) }),
          creer('td', { classe: 'nombre', texte: this.pourcentage(ligne.margePourcent) }),
        ]));
      }

      zone.append(creer('section', { classe: 'panneau facture-benefice' }, [
        creer('div', { classe: 'facture-benefice-entete' }, [
          creer('div', {}, [
            creer('span', { classe: 'libelle-doux', texte: 'Facture achat' }),
            creer('h3', { texte: facture.numero }),
            creer('p', { classe: 'aide', texte: [facture.fournisseurNom, facture.referenceDocument].filter(Boolean).join(' — ') || 'Fournisseur' }),
          ]),
          creer('div', { classe: 'facture-benefice-total' }, [
            creer('span', { texte: 'Benefice facture' }),
            creer('strong', { texte: formater(facture.benefice) }),
            creer('small', { texte: 'Marge ' + this.pourcentage(facture.margePourcent) }),
          ]),
        ]),
        creer('div', { classe: 'table-scroll' }, [
          creer('table', { classe: 'benefices-table' }, [
            creer('thead', {}, [
              creer('tr', {}, [
                creer('th', { texte: 'Article vendu' }),
                creer('th', { texte: 'Achat net' }),
                creer('th', { texte: 'Vendu' }),
                creer('th', { classe: 'nombre', texte: 'Cout' }),
                creer('th', { classe: 'nombre', texte: 'Vente' }),
                creer('th', { classe: 'nombre', texte: 'Benefice' }),
                creer('th', { classe: 'nombre', texte: 'Marge' }),
              ]),
            ]),
            corps,
          ]),
        ]),
      ]));
    }
  },
};

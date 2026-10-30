'use strict';

const Audit = {
  lignes: [],
  filtresPrets: false,

  async activer() {
    vider($('#actions-vue'));
    const bouton = creer('button', { classe: 'bouton discret', texte: 'Actualiser', sur: { click: () => this.charger() } });
    $('#actions-vue').append(bouton);
    this.preparerFiltres();
    await this.charger();
  },

  preparerFiltres() {
    if (this.filtresPrets) return;
    this.filtresPrets = true;
    for (const id of ['audit-recherche', 'audit-action', 'audit-entite', 'audit-limite']) {
      const element = $('#' + id);
      if (!element) continue;
      const evenement = element.tagName === 'INPUT' ? 'input' : 'change';
      element.addEventListener(evenement, () => this.charger());
    }
  },

  options() {
    return {
      recherche: $('#audit-recherche')?.value ?? '',
      action: $('#audit-action')?.value ?? '',
      entite: $('#audit-entite')?.value ?? '',
      limite: Number($('#audit-limite')?.value) || 200,
    };
  },

  async charger() {
    const donnees = await appeler(window.caisse.audit.lister(this.options()));
    this.lignes = donnees.lignes;
    this.remplirFiltres(donnees.lignes);
    this.afficher(donnees.resume);
  },

  remplirFiltres(lignes) {
    const remplir = (selecteur, valeurs) => {
      const select = $(selecteur);
      if (!select) return;
      const courant = select.value;
      const titre = select.querySelector('option[value=""]')?.textContent || 'Toutes';
      vider(select);
      select.append(creer('option', { texte: titre, attributs: { value: '' } }));
      const options = valeurs.includes(courant) || !courant ? valeurs : [courant, ...valeurs];
      for (const valeur of options) {
        select.append(creer('option', { texte: valeur, attributs: { value: valeur } }));
      }
      select.value = courant;
    };
    remplir('#audit-action', [...new Set(lignes.map((l) => l.action))].sort());
    remplir('#audit-entite', [...new Set(lignes.map((l) => l.entite))].sort());
  },

  dateLisible(valeur) {
    const date = new Date(valeur);
    return Number.isNaN(date.getTime()) ? String(valeur ?? '') : date.toLocaleString('fr-FR');
  },

  afficher(resume) {
    $('#audit-total').textContent = (resume?.total ?? this.lignes.length) + ' action(s) journalisee(s)';
    const corps = $('#corps-audit');
    vider(corps);
    if (this.lignes.length === 0) {
      corps.append(creer('tr', {}, [
        creer('td', { classe: 'vide', texte: 'Aucune action ne correspond aux filtres.', attributs: { colspan: '5' } }),
      ]));
      return;
    }
    for (const ligne of this.lignes) {
      corps.append(creer('tr', {}, [
        creer('td', { texte: this.dateLisible(ligne.date) }),
        creer('td', {}, [
          creer('strong', { texte: ligne.utilisateurNom || 'Systeme' }),
          creer('span', { classe: 'aide', texte: ligne.utilisateurRole ? ' — ' + ligne.utilisateurRole : '' }),
        ]),
        creer('td', {}, [creer('span', { classe: 'pastille', texte: ligne.action })]),
        creer('td', { texte: ligne.entite + (ligne.entiteId ? ' #' + ligne.entiteId : '') }),
        creer('td', { texte: ligne.resume || '-' }),
      ]));
    }
  },
};

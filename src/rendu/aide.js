'use strict';

const Aide = {
  recherche: '',

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    actions.append(
      creer('button', { classe: 'bouton discret', texte: 'Imprimer / PDF', sur: { click: () => window.print() } }),
      creer('button', { classe: 'bouton espace-gauche', texte: 'Aller a la vente', sur: { click: () => ouvrirVue('vente') } })
    );
    this.afficher();
  },

  afficher() {
    const zone = $('#contenu-aide');
    vider(zone);

    const champ = creer('input', {
      attributs: {
        type: 'search',
        placeholder: 'Chercher : vente, stock, credit, sauvegarde, reseau...',
        value: this.recherche,
        autocomplete: 'off',
      },
    });
    const resultats = creer('div', { classe: 'guide-grille' });
    champ.addEventListener('input', () => {
      this.recherche = champ.value;
      this.afficherSections(resultats);
    });

    zone.append(
      creer('section', { classe: 'aide-hero' }, [
        creer('div', {}, [
          creer('span', { classe: 'libelle-doux', texte: 'Guide rapide integre' }),
          creer('h3', { texte: 'Bien utiliser Ivoire-Gestion' }),
          creer('p', {
            texte: 'Les procedures essentielles pour vendre, acheter, gerer le stock, suivre les credits, securiser les actions critiques et sauvegarder la base.',
          }),
        ]),
        creer('div', { classe: 'aide-recherche' }, [
          creer('label', { texte: 'Recherche dans le guide' }, [champ]),
        ]),
      ]),
      creer('section', { classe: 'aide-raccourcis' }, [
        this.raccourci('1', 'Connexion', 'CIV / CIV au premier acces, puis changement du mot de passe.'),
        this.raccourci('2', 'Vente stricte', 'Caisse ouverte obligatoire et stock negatif refuse.'),
        this.raccourci('3', 'Stock parfait', 'Pieces et cartons sont convertis en pieces avec historique.'),
        this.raccourci('4', 'Audit', 'Chaque action sensible garde utilisateur, date et motif.'),
      ]),
      resultats
    );

    this.afficherSections(resultats);
  },

  raccourci(numero, titre, texte) {
    return creer('article', { classe: 'aide-raccourci' }, [
      creer('strong', { texte: numero }),
      creer('div', {}, [
        creer('b', { texte: titre }),
        creer('span', { texte }),
      ]),
    ]);
  },

  afficherSections(conteneur) {
    vider(conteneur);
    const sections = globalThis.rechercherGuideUtilisateur(
      globalThis.GUIDE_UTILISATEUR || [],
      this.recherche
    );
    if (sections.length === 0) {
      conteneur.append(creer('p', { classe: 'vide', texte: 'Aucune rubrique ne correspond a cette recherche.' }));
      return;
    }

    for (const section of sections) {
      const carte = creer('article', { classe: 'guide-carte' }, [
        creer('div', { classe: 'guide-carte-entete' }, [
          creer('h3', { texte: section.titre }),
          creer('span', { classe: 'pastille', texte: (section.etapes || []).length + ' etapes' }),
        ]),
        creer('p', { classe: 'guide-resume', texte: section.resume }),
        creer('ol', { classe: 'guide-etapes' }, (section.etapes || []).map((etape) => creer('li', { texte: etape }))),
      ]);

      if ((section.vigilance || []).length > 0) {
        carte.append(creer('div', { classe: 'guide-vigilance' }, [
          creer('strong', { texte: 'Points de vigilance' }),
          creer('ul', {}, section.vigilance.map((item) => creer('li', { texte: item }))),
        ]));
      }

      const actions = (section.actions || []).filter((action) => this.actionVisible(action));
      if (actions.length > 0) {
        carte.append(creer('div', { classe: 'guide-actions' }, actions.map((action) =>
          creer('button', {
            classe: 'bouton discret',
            texte: action.libelle,
            sur: { click: () => ouvrirVue(action.vue) },
          })
        )));
      }

      conteneur.append(carte);
    }
  },

  actionVisible(action) {
    if (action.permission && !App.peut(action.permission)) return false;
    if (action.permissionAny && !App.peutUn(action.permissionAny)) return false;
    const bouton = $('.navigation button[data-vue="' + action.vue + '"]');
    return !bouton || !bouton.hidden;
  },
};

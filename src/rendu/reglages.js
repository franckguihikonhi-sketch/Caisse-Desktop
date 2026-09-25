'use strict';

/* Reglages : identite de la boutique (elle figure sur chaque ticket) et comptes.
   Ecran reserve a l'administrateur. */

const Reglages = {
  roles: [],

  async activer() {
    vider($('#actions-vue'));
    App.parametres = await appeler(window.caisse.parametres.lire());

    const formulaire = $('#formulaire-boutique');
    formulaire.hidden = !App.peut('parametres:gerer');
    for (const champ of formulaire.querySelectorAll('input[name]')) {
      champ.value = App.parametres[champ.name] ?? '';
    }

    const panneauComptes = $('#corps-utilisateurs').closest('.panneau');
    panneauComptes.hidden = !App.peut('utilisateurs:gerer');
    if (App.peut('utilisateurs:gerer')) {
      this.roles = await appeler(window.caisse.utilisateurs.roles());
      await this.chargerComptes();
    }

    await this.chargerBase();
  },

  async chargerBase() {
    const panneau = $('.panneau-base-reseau');
    const peutBase = App.peut('base:gerer');
    const peutExport = App.peut('rapports:exports');
    panneau.hidden = !peutBase && !peutExport;
    if (panneau.hidden) return;

    $('#bouton-sauvegarder-base').hidden = !peutBase;
    $('#bouton-restaurer-base').hidden = !peutBase;
    $('#bouton-tester-base-reseau').hidden = !peutBase;
    $('#bouton-choisir-base-reseau').hidden = !peutBase;
    $('#bouton-base-locale').hidden = !peutBase;
    $('#bouton-exporter-csv').hidden = !peutExport;

    const infos = await appeler(window.caisse.base.infos());
    const bloc = $('#infos-base-donnees');
    vider(bloc);
    bloc.append(
      creer('div', { classe: 'ligne-info-base' }, [
        creer('span', { texte: 'Mode' }),
        creer('strong', { texte: infos.reseau ? 'Reseau local partage' : 'Local sur ce poste' }),
      ]),
      creer('div', { classe: 'ligne-info-base' }, [
        creer('span', { texte: 'Fichier' }),
        creer('strong', { texte: infos.chemin }),
      ])
    );

    if (peutBase) {
      const sauvegardes = await appeler(window.caisse.base.sauvegardes());
      this.afficherSauvegardes(sauvegardes);
    } else {
      const blocSauvegardes = $('#infos-sauvegardes');
      vider(blocSauvegardes);
      blocSauvegardes.append(creer('p', {
        classe: 'aide',
        texte: 'Votre role autorise les exports, pas la sauvegarde/restauration de la base.',
      }));
    }
  },

  afficherSauvegardes(donnees) {
    const bloc = $('#infos-sauvegardes');
    vider(bloc);
    const derniereAuto = donnees.fichiersAutomatiques?.[0];
    const derniereManuelle = donnees.fichiersManuels?.[0];
    bloc.append(
      creer('div', { classe: 'ligne-info-base' }, [
        creer('span', { texte: 'Sauvegarde auto' }),
        creer('strong', { texte: derniereAuto ? this.formatDateFichier(derniereAuto) : 'Aucune encore' }),
      ]),
      creer('div', { classe: 'ligne-info-base' }, [
        creer('span', { texte: 'Sauvegarde manuelle' }),
        creer('strong', { texte: derniereManuelle ? this.formatDateFichier(derniereManuelle) : 'Aucune encore' }),
      ]),
      creer('div', { classe: 'ligne-info-base' }, [
        creer('span', { texte: 'Dossier auto' }),
        creer('strong', { texte: donnees.dossierAutomatique }),
      ])
    );
  },

  formatDateFichier(fichier) {
    const date = new Date(fichier.date);
    const dateLisible = Number.isNaN(date.getTime()) ? fichier.date : date.toLocaleString('fr-FR');
    return dateLisible + ' — ' + fichier.nom;
  },

  async testerBaseReseau() {
    try {
      const resultat = await appeler(window.caisse.base.testerReseau());
      afficherMessage(
        $('#message-base-reseau'),
        'Test OK : ecriture/lecture du dossier en ' + resultat.latenceMs + ' ms, integrite SQLite ' + resultat.integrite + ', journal ' + resultat.journal + '.',
        'succes'
      );
    } catch (erreur) {
      afficherMessage($('#message-base-reseau'), erreur.message, 'erreur');
    }
  },

  async choisirBaseReseau() {
    const confirme = await confirmer(
      'Utiliser une base partagee ?',
      "Choisissez un dossier partage du reseau local. Si le fichier caisse.db n'existe pas, la base actuelle y sera copiee. Si le fichier existe deja, ce poste utilisera cette base apres redemarrage.",
      'Choisir le dossier'
    );
    if (!confirme) return;

    try {
      const resultat = await appeler(window.caisse.base.choisirDossier());
      if (resultat.annule) return;
      if (resultat.dejaActive) {
        afficherMessage($('#message-base-reseau'), 'Ce dossier est deja la base active.', 'succes');
        return;
      }
      $('#bouton-redemarrer-base').hidden = false;
      const detail = resultat.copieCreee
        ? 'La base actuelle a ete copiee dans le dossier partage.'
        : (resultat.dejaPresente
            ? 'Une base existante a ete detectee dans ce dossier.'
            : 'Le dossier partage est configure.');
      afficherMessage(
        $('#message-base-reseau'),
        detail + ' Redemarrez Ivoire-Gestion pour l utiliser.',
        'succes'
      );
    } catch (erreur) {
      afficherMessage($('#message-base-reseau'), erreur.message, 'erreur');
    }
  },

  async retablirBaseLocale() {
    const confirme = await confirmer(
      'Revenir a la base locale ?',
      'Ce poste reviendra a sa base locale apres redemarrage. La base partagee ne sera pas supprimee.',
      'Revenir en local'
    );
    if (!confirme) return;

    try {
      await appeler(window.caisse.base.retablirLocale());
      $('#bouton-redemarrer-base').hidden = false;
      afficherMessage($('#message-base-reseau'), 'Configuration locale enregistree. Redemarrez Ivoire-Gestion.', 'succes');
    } catch (erreur) {
      afficherMessage($('#message-base-reseau'), erreur.message, 'erreur');
    }
  },

  async sauvegarderBase() {
    try {
      const resultat = await appeler(window.caisse.base.sauvegarder());
      if (resultat.annule) return;
      afficherMessage(
        $('#message-base-reseau'),
        'Sauvegarde creee : ' + resultat.chemin,
        'succes'
      );
      await this.chargerBase();
    } catch (erreur) {
      afficherMessage($('#message-base-reseau'), erreur.message, 'erreur');
    }
  },

  async restaurerBase() {
    const confirme = await confirmer(
      'Restaurer une sauvegarde ?',
      "La base actuelle sera d'abord sauvegardee par securite, puis remplacee par le fichier choisi. Ivoire-Gestion redemarrera automatiquement.",
      'Choisir une sauvegarde'
    );
    if (!confirme) return;
    try {
      const resultat = await appeler(window.caisse.base.restaurerSauvegarde());
      if (resultat.annule) return;
      afficherMessage($('#message-base-reseau'), 'Sauvegarde restauree. Redemarrage en cours...', 'succes');
    } catch (erreur) {
      afficherMessage($('#message-base-reseau'), erreur.message, 'erreur');
    }
  },

  async exporterCsv() {
    try {
      const resultat = await appeler(window.caisse.exports.csv());
      afficherMessage(
        $('#message-base-reseau'),
        resultat.nombreFichiers + ' fichiers exportes dans : ' + resultat.dossier,
        'succes'
      );
    } catch (erreur) {
      afficherMessage($('#message-base-reseau'), erreur.message, 'erreur');
    }
  },

  async redemarrerApplication() {
    await appeler(window.caisse.base.redemarrer());
  },

  async enregistrerBoutique(evenement) {
    evenement.preventDefault();
    const formulaire = evenement.target;
    const valeurs = {};
    for (const champ of formulaire.querySelectorAll('input[name]')) valeurs[champ.name] = champ.value;

    try {
      App.parametres = await appeler(window.caisse.parametres.ecrire(valeurs));
      App.boutique = {
        nom: App.parametres['boutique.nom'],
        adresse: App.parametres['boutique.adresse'],
        telephone: App.parametres['boutique.telephone'],
        numeroContribuable: App.parametres['boutique.numeroContribuable'],
      };
      $('#nom-boutique').textContent = App.boutique.nom;
      afficherMessage($('#message-boutique'), 'Enregistre.', 'succes');
    } catch (erreur) {
      afficherMessage($('#message-boutique'), erreur.message, 'erreur');
    }
  },

  async chargerComptes() {
    const comptes = await appeler(window.caisse.utilisateurs.lister());
    const corps = $('#corps-utilisateurs');
    vider(corps);

    for (const compte of comptes) {
      const actions = creer('td', { classe: 'nombre' }, [
        creer('button', {
          classe: 'bouton discret', texte: 'Mot de passe',
          sur: { click: () => this.changerMotDePasse(compte) },
        }),
      ]);

      if (compte.id !== App.utilisateur.id) {
        actions.append(creer('button', {
          classe: 'bouton discret espace-gauche',
          texte: compte.actif ? 'Desactiver' : 'Reactiver',
          sur: { click: () => this.activerCompte(compte) },
        }));
      }

      corps.append(creer('tr', { classe: compte.actif ? '' : 'annulee' }, [
        creer('td', { texte: compte.nom }),
        creer('td', { texte: compte.identifiant }),
        creer('td', { texte: compte.roleLibelle || compte.role }),
        actions,
      ]));
    }
  },

  async nouveauCompte() {
    const cree = await ouvrirBoite((fermer) => {
      const nom = creer('input', { attributs: { type: 'text', required: 'required' } });
      const identifiant = creer('input', { attributs: { type: 'text', required: 'required', autocomplete: 'off' } });
      const motDePasse = creer('input', { attributs: { type: 'password', required: 'required', minlength: '3' } });
      const role = creer('select', {}, this.roles.map((r) =>
        creer('option', { texte: r.libelle, attributs: { value: r.code } })
      ));
      const erreur = creer('p', { classe: 'message erreur' });

      return creer('form', {
        sur: {
          submit: async (e) => {
            e.preventDefault();
            try {
              fermer(await appeler(window.caisse.utilisateurs.creer({
                nom: nom.value, identifiant: identifiant.value,
                motDePasse: motDePasse.value, role: role.value,
              })));
            } catch (probleme) {
              afficherMessage(erreur, probleme.message);
            }
          },
        },
      }, [
        creer('h3', { texte: 'Nouveau compte' }),
        erreur,
        creer('label', { texte: 'Nom complet' }, [nom]),
        creer('label', { texte: 'Identifiant' }, [identifiant]),
        creer('label', { texte: 'Mot de passe (3 caracteres minimum)' }, [motDePasse]),
        creer('label', { texte: 'Role' }, [role]),
        creer('div', { classe: 'actions' }, [
          creer('button', {
            classe: 'bouton discret', texte: 'Annuler',
            attributs: { type: 'button' }, sur: { click: () => fermer(null) },
          }),
          creer('button', { classe: 'bouton', texte: 'Creer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });

    if (cree) await this.chargerComptes();
  },

  async changerMotDePasse(compte) {
    await ouvrirBoite((fermer) => {
      const motDePasse = creer('input', { attributs: { type: 'password', required: 'required', minlength: '3' } });
      const erreur = creer('p', { classe: 'message erreur' });

      return creer('form', {
        sur: {
          submit: async (e) => {
            e.preventDefault();
            try {
              await appeler(window.caisse.utilisateurs.motDePasse({
                id: compte.id, motDePasse: motDePasse.value,
              }));
              fermer(true);
            } catch (probleme) {
              afficherMessage(erreur, probleme.message);
            }
          },
        },
      }, [
        creer('h3', { texte: 'Mot de passe de ' + compte.nom }),
        erreur,
        creer('label', { texte: 'Nouveau mot de passe' }, [motDePasse]),
        creer('div', { classe: 'actions' }, [
          creer('button', {
            classe: 'bouton discret', texte: 'Annuler',
            attributs: { type: 'button' }, sur: { click: () => fermer(null) },
          }),
          creer('button', { classe: 'bouton', texte: 'Changer', attributs: { type: 'submit' } }),
        ]),
      ]);
    });
  },

  async activerCompte(compte) {
    if (compte.actif) {
      const confirme = await confirmer(
        'Desactiver ' + compte.nom + ' ?',
        'Ce compte ne pourra plus ouvrir la caisse. Ses ventes passees restent au journal.',
        'Desactiver'
      );
      if (!confirme) return;
    }
    await appeler(window.caisse.utilisateurs.activer({ id: compte.id, actif: !compte.actif }));
    await this.chargerComptes();
  },
};

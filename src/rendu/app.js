'use strict';

/* Point d'entree du rendu : etat de session, aiguillage entre les ecrans. */

const VUES = {
  tableauBord: { titre: 'Tableau de bord', module: () => TableauBord },
  vente: { titre: 'Vente', module: () => Vente },
  achats: { titre: 'Achats marchandises', module: () => Achats },
  benefices: { titre: 'Benefices par facture d achat', module: () => Benefices },
  stock: { titre: 'Stock restant', module: () => Stock },
  articles: { titre: 'Articles', module: () => Articles },
  clients: { titre: 'Clients et credits', module: () => Clients },
  fournisseurs: { titre: 'Fournisseurs', module: () => Fournisseurs },
  journal: { titre: 'Caisse et journal', module: () => Journal },
  audit: { titre: 'Historique et audit', module: () => Audit },
  reglages: { titre: 'Reglages', module: () => Reglages },
  aide: { titre: 'Guide utilisateur', module: () => Aide },
};

function montrerEcran(nom) {
  for (const ecran of $$('.ecran')) ecran.classList.toggle('actif', ecran.id === 'ecran-' + nom);
}

function vueAutorisee(bouton) {
  const requis = (bouton.dataset.permission || '').split(',').map((p) => p.trim()).filter(Boolean);
  const unParmi = (bouton.dataset.permissionAny || '').split(',').map((p) => p.trim()).filter(Boolean);
  return (requis.length === 0 || requis.every((p) => App.peut(p))) &&
    (unParmi.length === 0 || App.peutUn(unParmi));
}

async function ouvrirVue(nom) {
  const boutonVue = $('.navigation button[data-vue="' + nom + '"]');
  if (boutonVue && !vueAutorisee(boutonVue)) {
    await ouvrirBoite((fermer) => creer('div', {}, [
      creer('h3', { texte: 'Acces refuse' }),
      creer('p', { texte: "Votre role ne donne pas acces a cet ecran." }),
      creer('div', { classe: 'actions' }, [
        creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
      ]),
    ]));
    return;
  }

  for (const bouton of $$('.navigation button')) {
    bouton.classList.toggle('actif', bouton.dataset.vue === nom);
  }
  for (const vue of $$('.vue')) vue.classList.toggle('actif', vue.id === 'vue-' + nom);
  $('#titre-vue').textContent = VUES[nom].titre;
  vider($('#actions-vue'));

  try {
    await VUES[nom].module().activer();
  } catch (erreur) {
    await ouvrirBoite((fermer) =>
      creer('div', {}, [
        creer('h3', { texte: 'Ecran indisponible' }),
        creer('p', { texte: erreur.message }),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton', texte: 'Fermer', sur: { click: () => fermer(null) } }),
        ]),
      ])
    );
  }
}

async function entrerDansApplication(utilisateur) {
  App.utilisateur = utilisateur;
  App.parametres = await appeler(window.caisse.parametres.lire());
  App.boutique = {
    nom: App.parametres['boutique.nom'],
    adresse: App.parametres['boutique.adresse'],
    telephone: App.parametres['boutique.telephone'],
    numeroContribuable: App.parametres['boutique.numeroContribuable'],
  };

  App.roles = App.roles.length ? App.roles : [];

  $('#nom-boutique').textContent = App.boutique.nom;
  $('#nom-utilisateur').textContent = utilisateur.nom;
  $('#role-utilisateur').textContent = utilisateur.roleLibelle || utilisateur.role;

  for (const bouton of $$('.navigation button')) {
    bouton.hidden = !vueAutorisee(bouton);
  }

  montrerEcran('application');
  Vente.reinitialiser();
  const premiere = $$('.navigation button:not([hidden])')[0]?.dataset.vue || 'tableauBord';
  await ouvrirVue(premiere);
}

async function demarrer() {
  const etat = await appeler(window.caisse.session.etat());
  App.boutique = etat.boutique;
  App.roles = etat.roles ?? [];

  if (etat.premiereOuverture) {
    montrerEcran('accueil');
    return;
  }
  $('#titre-connexion').textContent = 'Ivoire-Gestion';
  montrerEcran('connexion');
}

// --- Branchements ----------------------------------------------------------

$('#formulaire-administrateur').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const donnees = Object.fromEntries(new FormData(evenement.target));
  const erreur = $('#erreur-administrateur');

  if (donnees.motDePasse !== donnees.confirmation) {
    return afficherMessage(erreur, 'Les deux mots de passe ne sont pas identiques.');
  }
  try {
    const cree = await appeler(window.caisse.session.creerAdministrateur({
      nom: donnees.nom, identifiant: donnees.identifiant, motDePasse: donnees.motDePasse,
    }));
    await entrerDansApplication(cree);
  } catch (probleme) {
    afficherMessage(erreur, probleme.message);
  }
});

$('#formulaire-connexion').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const donnees = Object.fromEntries(new FormData(evenement.target));
  try {
    const utilisateur = await appeler(window.caisse.session.connexion(donnees));
    afficherMessage($('#erreur-connexion'), '');
    evenement.target.reset();
    await entrerDansApplication(utilisateur);
  } catch (probleme) {
    afficherMessage($('#erreur-connexion'), probleme.message);
  }
});

$('#bouton-changer-mot-de-passe').addEventListener('click', () => {
  if (App.utilisateur) Reglages.changerMotDePasse(App.utilisateur);
});

$('#bouton-deconnexion').addEventListener('click', async () => {
  await appeler(window.caisse.session.deconnexion());
  App.utilisateur = null;
  Vente.reinitialiser();
  montrerEcran('connexion');
  $('#formulaire-connexion').querySelector('input').focus();
});

for (const bouton of $$('.navigation button')) {
  bouton.addEventListener('click', () => ouvrirVue(bouton.dataset.vue));
}

$('#formulaire-boutique').addEventListener('submit', (e) => Reglages.enregistrerBoutique(e));
$('#bouton-nouvel-utilisateur').addEventListener('click', () => Reglages.nouveauCompte());
$('#bouton-tester-base-reseau').addEventListener('click', () => Reglages.testerBaseReseau());
$('#bouton-choisir-base-reseau').addEventListener('click', () => Reglages.choisirBaseReseau());
$('#bouton-base-locale').addEventListener('click', () => Reglages.retablirBaseLocale());
$('#bouton-sauvegarder-base').addEventListener('click', () => Reglages.sauvegarderBase());
$('#bouton-restaurer-base').addEventListener('click', () => Reglages.restaurerBase());
$('#bouton-exporter-csv').addEventListener('click', () => Reglages.exporterCsv());
$('#bouton-redemarrer-base').addEventListener('click', () => Reglages.redemarrerApplication());

Vente.initialiser();
demarrer();

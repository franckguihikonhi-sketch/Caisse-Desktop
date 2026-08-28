'use strict';

/* Point d'entree du rendu : etat de session, aiguillage entre les ecrans. */

const VUES = {
  vente: { titre: 'Vente', module: () => Vente },
  articles: { titre: 'Articles', module: () => Articles },
  journal: { titre: 'Journal et cloture', module: () => Journal },
  reglages: { titre: 'Reglages', module: () => Reglages },
};

function montrerEcran(nom) {
  for (const ecran of $$('.ecran')) ecran.classList.toggle('actif', ecran.id === 'ecran-' + nom);
}

async function ouvrirVue(nom) {
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

  $('#nom-boutique').textContent = App.boutique.nom;
  $('#nom-utilisateur').textContent = utilisateur.nom;
  $('#role-utilisateur').textContent = utilisateur.role;

  for (const bouton of $$('.navigation button[data-admin]')) {
    bouton.hidden = utilisateur.role !== 'administrateur';
  }

  montrerEcran('application');
  Vente.reinitialiser();
  await ouvrirVue('vente');
}

async function demarrer() {
  const etat = await appeler(window.caisse.session.etat());
  App.boutique = etat.boutique;

  if (etat.premiereOuverture) {
    montrerEcran('accueil');
    return;
  }
  $('#titre-connexion').textContent = etat.boutique.nom;
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

Vente.initialiser();
demarrer();

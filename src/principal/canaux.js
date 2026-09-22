'use strict';

const { ipcMain } = require('electron');

const base = require('../donnees/base');
const utilisateurs = require('../donnees/utilisateurs');
const articles = require('../donnees/articles');
const ventes = require('../donnees/ventes');
const clients = require('../donnees/clients');
const fournisseurs = require('../donnees/fournisseurs');
const achats = require('../donnees/achats');
const caisse = require('../donnees/caisse');
const stocks = require('../donnees/stocks');
const tableauDeBord = require('../donnees/tableau-de-bord');
const { jour } = require('../metier/horodatage');

/**
 * Le processus de rendu n'a pas acces a la base : il passe par ces canaux.
 * Chacun rend {ok: true, valeur} ou {ok: false, erreur}, de sorte qu'une erreur
 * metier remonte a l'ecran comme un message lisible et non comme une exception
 * silencieuse. La session est tenue ici, cote principal : une page ne peut pas
 * se declarer administrateur.
 */
function enregistrerCanaux(bd, session) {
  const repondre = (nom, traitement, { exigeSession = true, exigeAdmin = false } = {}) => {
    ipcMain.handle(nom, async (_evenement, argument) => {
      try {
        if (exigeSession && !session.utilisateur) {
          throw new Error('Aucune session ouverte.');
        }
        if (exigeAdmin && session.utilisateur.role !== 'administrateur') {
          throw new Error("Cette action est reservee a l'administrateur.");
        }
        return { ok: true, valeur: await traitement(argument) };
      } catch (erreur) {
        return { ok: false, erreur: erreur.message };
      }
    });
  };

  const libre = { exigeSession: false };
  const admin = { exigeAdmin: true };

  // --- Session ---------------------------------------------------------------
  repondre('session:etat', () => ({
    premiereOuverture: utilisateurs.aucunCompte(bd),
    utilisateur: session.utilisateur,
    boutique: base.boutique(bd),
  }), libre);

  repondre('session:creerAdministrateur', (donnees) => {
    if (!utilisateurs.aucunCompte(bd)) {
      throw new Error('La caisse a deja un administrateur.');
    }
    const cree = utilisateurs.creer(bd, { ...donnees, role: 'administrateur' });
    session.utilisateur = cree;
    return cree;
  }, libre);

  repondre('session:connexion', ({ identifiant, motDePasse }) => {
    const utilisateur = utilisateurs.authentifier(bd, identifiant, motDePasse);
    if (!utilisateur) throw new Error('Identifiant ou mot de passe incorrect.');
    session.utilisateur = utilisateur;
    return utilisateur;
  }, libre);

  repondre('session:deconnexion', () => {
    session.utilisateur = null;
    return true;
  }, libre);

  // --- Tableau de bord et caisse --------------------------------------------
  repondre('tableauDeBord:lire', (options) => tableauDeBord.lire(bd, options ?? {}));
  repondre('caisse:etat', () => caisse.etat(bd));
  repondre('caisse:ouvrir', (donnees) => caisse.ouvrir(bd, { ...donnees, utilisateurId: session.utilisateur.id }));
  repondre('caisse:fermer', (donnees) => caisse.fermer(bd, { ...donnees, utilisateurId: session.utilisateur.id }));
  repondre('caisse:sessions', (options) => caisse.lister(bd, options ?? {}), admin);

  // --- Articles --------------------------------------------------------------
  repondre('articles:lister', (options) => articles.lister(bd, options ?? {}));
  repondre('articles:chercher', ({ texte, options }) => articles.chercher(bd, texte, options));
  repondre('articles:parCodeBarres', ({ code }) => articles.lireParCodeBarres(bd, code));
  repondre('articles:creer', (article) => articles.creer(bd, article), admin);
  repondre('articles:modifier', ({ id, article }) => articles.modifier(bd, id, article), admin);
  repondre('articles:retirer', ({ id }) => articles.retirer(bd, id), admin);
  repondre('articles:attribuerCodeInterne', () => articles.attribuerCodeInterne(bd), admin);
  repondre('articles:sousLeSeuil', () => articles.sousLeSeuil(bd));
  repondre('stock:mouvement', (demande) => stocks.mouvement(bd, { ...demande, utilisateurId: session.utilisateur.id }), admin);
  repondre('stock:lister', (options) => stocks.lister(bd, options ?? {}));

  // --- Clients et creances ---------------------------------------------------
  repondre('clients:lister', (options) => clients.lister(bd, options ?? {}));
  repondre('clients:creer', (donnees) => clients.creer(bd, donnees), admin);
  repondre('clients:modifier', ({ id, client }) => clients.modifier(bd, id, client), admin);
  repondre('clients:retirer', ({ id }) => clients.retirer(bd, id), admin);
  repondre('clients:creances', (options) => clients.listerCreances(bd, options ?? {}));
  repondre('clients:creanceAnterieure', (donnees) => clients.creerCreanceAnterieure(bd, donnees), admin);
  repondre('clients:regler', (donnees) =>
    clients.enregistrerReglement(bd, { ...donnees, utilisateurId: session.utilisateur.id }));

  // --- Fournisseurs et dettes ------------------------------------------------
  repondre('fournisseurs:lister', (options) => fournisseurs.lister(bd, options ?? {}));
  repondre('fournisseurs:creer', (donnees) => fournisseurs.creer(bd, donnees), admin);
  repondre('fournisseurs:modifier', ({ id, fournisseur }) => fournisseurs.modifier(bd, id, fournisseur), admin);
  repondre('fournisseurs:retirer', ({ id }) => fournisseurs.retirer(bd, id), admin);
  repondre('fournisseurs:dettes', (options) => fournisseurs.listerDettes(bd, options ?? {}));
  repondre('fournisseurs:detteAnterieure', (donnees) => fournisseurs.creerDetteAnterieure(bd, donnees), admin);
  repondre('fournisseurs:regler', (donnees) =>
    fournisseurs.enregistrerReglement(bd, { ...donnees, utilisateurId: session.utilisateur.id }), admin);

  // --- Achats marchandises ---------------------------------------------------
  repondre('achats:enregistrer', (donnees) =>
    achats.enregistrer(bd, { ...donnees, utilisateurId: session.utilisateur.id }), admin);
  repondre('achats:lister', (options) => achats.lister(bd, options ?? {}), admin);
  repondre('achats:lire', ({ id }) => achats.lire(bd, id), admin);
  repondre('achats:annuler', ({ id, motif }) => achats.annuler(bd, id, motif, session.utilisateur.id), admin);
  repondre('achats:retourner', (donnees) =>
    achats.retourner(bd, { ...donnees, utilisateurId: session.utilisateur.id }), admin);
  repondre('achats:retours', (options) => achats.listerRetours(bd, options ?? {}), admin);
  repondre('achats:annulerRetour', ({ id, motif }) => achats.annulerRetour(bd, id, motif, session.utilisateur.id), admin);

  // --- Ventes ----------------------------------------------------------------
  repondre('ventes:enregistrer', (commande) =>
    ventes.lire(bd, ventes.enregistrer(bd, {
      ...commande,
      utilisateurId: session.utilisateur.id,
      exigerCaisse: true,
    }).id));
  repondre('ventes:lire', ({ id }) => ventes.lire(bd, id));
  repondre('ventes:journal', ({ jour: j } = {}) => ventes.journal(bd, j ?? jour()));
  repondre('ventes:cloture', ({ jour: j } = {}) => ventes.cloture(bd, j ?? jour()));
  repondre('ventes:annuler', ({ id, motif }) => ventes.annuler(bd, id, motif, session.utilisateur.id), admin);
  repondre('ventes:retourner', (donnees) =>
    ventes.retourner(bd, { ...donnees, utilisateurId: session.utilisateur.id }), admin);
  repondre('ventes:retours', (options) => ventes.listerRetours(bd, options ?? {}), admin);
  repondre('ventes:annulerRetour', ({ id, motif }) => ventes.annulerRetour(bd, id, motif, session.utilisateur.id), admin);

  // --- Utilisateurs ----------------------------------------------------------
  repondre('utilisateurs:lister', () => utilisateurs.lister(bd), admin);
  repondre('utilisateurs:creer', (donnees) => utilisateurs.creer(bd, donnees), admin);
  repondre('utilisateurs:motDePasse', ({ id, motDePasse }) => {
    // Chacun peut changer le sien ; changer celui d'autrui demande le role admin.
    if (id !== session.utilisateur.id && session.utilisateur.role !== 'administrateur') {
      throw new Error("Cette action est reservee a l'administrateur.");
    }
    utilisateurs.changerMotDePasse(bd, id, motDePasse);
    return true;
  });
  repondre('utilisateurs:activer', ({ id, actif }) => {
    if (id === session.utilisateur.id && !actif) {
      throw new Error('On ne desactive pas le compte avec lequel on travaille.');
    }
    utilisateurs.activer(bd, id, actif);
    return true;
  }, admin);

  // --- Parametres ------------------------------------------------------------
  repondre('parametres:lire', () => base.lireParametres(bd));
  repondre('parametres:ecrire', (valeurs) => {
    base.ecrireParametres(bd, valeurs);
    return base.lireParametres(bd);
  }, admin);
}

module.exports = { enregistrerCanaux };

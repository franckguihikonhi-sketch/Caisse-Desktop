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
const benefices = require('../donnees/benefices');
const { jour } = require('../metier/horodatage');

const P = utilisateurs.PERMISSIONS;

/**
 * Le processus de rendu n'a pas acces a la base : il passe par ces canaux.
 * Chacun rend {ok: true, valeur} ou {ok: false, erreur}, de sorte qu'une erreur
 * metier remonte a l'ecran comme un message lisible et non comme une exception
 * silencieuse. La session est tenue ici, cote principal : une page ne peut pas
 * se declarer administrateur.
 */
function enregistrerCanaux(bd, session) {
  const repondre = (nom, traitement, { exigeSession = true, permission = null } = {}) => {
    ipcMain.handle(nom, async (_evenement, argument) => {
      try {
        if (exigeSession && !session.utilisateur) {
          throw new Error('Aucune session ouverte.');
        }
        if (permission) utilisateurs.exigerPermission(session.utilisateur, permission);
        return { ok: true, valeur: await traitement(argument) };
      } catch (erreur) {
        return { ok: false, erreur: erreur.message };
      }
    });
  };

  const libre = { exigeSession: false };
  const droit = (permission) => ({ permission });

  // --- Session ---------------------------------------------------------------
  repondre('session:etat', () => ({
    premiereOuverture: utilisateurs.aucunCompte(bd),
    utilisateur: session.utilisateur,
    boutique: base.boutique(bd),
    roles: utilisateurs.rolesDisponibles(),
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
  repondre('tableauDeBord:lire', (options) => tableauDeBord.lire(bd, options ?? {}), droit(P.DASHBOARD_LIRE));
  repondre('benefices:lister', (options) => benefices.lister(bd, options ?? {}), droit(P.RAPPORTS_BENEFICES));
  repondre('caisse:etat', () => caisse.etat(bd), droit(P.CAISSE_JOURNAL));
  repondre('caisse:ouvrir', (donnees) => caisse.ouvrir(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.CAISSE_GERER));
  repondre('caisse:fermer', (donnees) => caisse.fermer(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.CAISSE_GERER));
  repondre('caisse:sessions', (options) => caisse.lister(bd, options ?? {}), droit(P.CAISSE_JOURNAL));

  // --- Articles --------------------------------------------------------------
  repondre('articles:lister', (options) => articles.lister(bd, options ?? {}), droit(P.ARTICLES_LIRE));
  repondre('articles:chercher', ({ texte, options }) => articles.chercher(bd, texte, options), droit(P.ARTICLES_LIRE));
  repondre('articles:parCodeBarres', ({ code }) => articles.lireParCodeBarres(bd, code), droit(P.ARTICLES_LIRE));
  repondre('articles:creer', (article) => articles.creer(bd, article), droit(P.ARTICLES_GERER));
  repondre('articles:modifier', ({ id, article }) => articles.modifier(bd, id, article), droit(P.ARTICLES_GERER));
  repondre('articles:retirer', ({ id }) => articles.retirer(bd, id), droit(P.ARTICLES_GERER));
  repondre('articles:attribuerCodeInterne', () => articles.attribuerCodeInterne(bd), droit(P.ARTICLES_GERER));
  repondre('articles:sousLeSeuil', () => articles.sousLeSeuil(bd), droit(P.STOCK_LIRE));
  repondre('stock:mouvement', (demande) => stocks.mouvement(bd, { ...demande, utilisateurId: session.utilisateur.id }), droit(P.STOCK_MOUVEMENT));
  repondre('stock:lister', (options) => stocks.lister(bd, options ?? {}), droit(P.STOCK_LIRE));

  // --- Clients et creances ---------------------------------------------------
  repondre('clients:lister', (options) => clients.lister(bd, options ?? {}), droit(P.CLIENTS_LIRE));
  repondre('clients:creer', (donnees) => clients.creer(bd, donnees), droit(P.CLIENTS_GERER));
  repondre('clients:modifier', ({ id, client }) => clients.modifier(bd, id, client), droit(P.CLIENTS_GERER));
  repondre('clients:retirer', ({ id }) => clients.retirer(bd, id), droit(P.CLIENTS_GERER));
  repondre('clients:creances', (options) => clients.listerCreances(bd, options ?? {}), droit(P.CLIENTS_LIRE));
  repondre('clients:creance', ({ id }) => {
    const creance = clients.lireCreance(bd, id);
    if (!creance) throw new Error('Creance client introuvable.');
    return {
      creance,
      vente: creance.venteId ? ventes.lire(bd, creance.venteId) : null,
      reglements: clients.listerReglements(bd, creance.id),
    };
  }, droit(P.CLIENTS_LIRE));
  repondre('clients:creanceAnterieure', (donnees) => clients.creerCreanceAnterieure(bd, donnees), droit(P.CLIENTS_GERER));
  repondre('clients:regler', (donnees) =>
    clients.enregistrerReglement(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.CLIENTS_REGLER));

  // --- Fournisseurs et dettes ------------------------------------------------
  repondre('fournisseurs:lister', (options) => fournisseurs.lister(bd, options ?? {}), droit(P.FOURNISSEURS_LIRE));
  repondre('fournisseurs:creer', (donnees) => fournisseurs.creer(bd, donnees), droit(P.FOURNISSEURS_GERER));
  repondre('fournisseurs:modifier', ({ id, fournisseur }) => fournisseurs.modifier(bd, id, fournisseur), droit(P.FOURNISSEURS_GERER));
  repondre('fournisseurs:retirer', ({ id }) => fournisseurs.retirer(bd, id), droit(P.FOURNISSEURS_GERER));
  repondre('fournisseurs:dettes', (options) => fournisseurs.listerDettes(bd, options ?? {}), droit(P.FOURNISSEURS_LIRE));
  repondre('fournisseurs:detteAnterieure', (donnees) => fournisseurs.creerDetteAnterieure(bd, donnees), droit(P.FOURNISSEURS_GERER));
  repondre('fournisseurs:regler', (donnees) =>
    fournisseurs.enregistrerReglement(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.FOURNISSEURS_REGLER));

  // --- Achats marchandises ---------------------------------------------------
  repondre('achats:enregistrer', (donnees) =>
    achats.enregistrer(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.ACHATS_GERER));
  repondre('achats:lister', (options) => achats.lister(bd, options ?? {}), droit(P.ACHATS_LIRE));
  repondre('achats:lire', ({ id }) => achats.lire(bd, id), droit(P.ACHATS_LIRE));
  repondre('achats:annuler', ({ id, motif }) => achats.annuler(bd, id, motif, session.utilisateur.id), droit(P.ACHATS_GERER));
  repondre('achats:retourner', (donnees) =>
    achats.retourner(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.ACHATS_GERER));
  repondre('achats:retours', (options) => achats.listerRetours(bd, options ?? {}), droit(P.ACHATS_LIRE));
  repondre('achats:annulerRetour', ({ id, motif }) => achats.annulerRetour(bd, id, motif, session.utilisateur.id), droit(P.ACHATS_GERER));

  // --- Ventes ----------------------------------------------------------------
  repondre('ventes:enregistrer', (commande) =>
    ventes.lire(bd, ventes.enregistrer(bd, {
      ...commande,
      utilisateurId: session.utilisateur.id,
    }).id), droit(P.VENTE_ENCAISSER));
  repondre('ventes:lire', ({ id }) => ventes.lire(bd, id), droit(P.VENTE_LIRE));
  repondre('ventes:journal', ({ jour: j } = {}) => ventes.journal(bd, j ?? jour()), droit(P.CAISSE_JOURNAL));
  repondre('ventes:cloture', ({ jour: j } = {}) => ventes.cloture(bd, j ?? jour()), droit(P.CAISSE_JOURNAL));
  repondre('ventes:annuler', ({ id, motif }) => ventes.annuler(bd, id, motif, session.utilisateur.id), droit(P.VENTE_ANNULER));
  repondre('ventes:retourner', (donnees) =>
    ventes.retourner(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.VENTE_RETOUR));
  repondre('ventes:retours', (options) => ventes.listerRetours(bd, options ?? {}), droit(P.VENTE_RETOUR));
  repondre('ventes:annulerRetour', ({ id, motif }) => ventes.annulerRetour(bd, id, motif, session.utilisateur.id), droit(P.VENTE_RETOUR));

  // --- Utilisateurs ----------------------------------------------------------
  repondre('utilisateurs:roles', () => utilisateurs.rolesDisponibles(), droit(P.UTILISATEURS_GERER));
  repondre('utilisateurs:lister', () => utilisateurs.lister(bd), droit(P.UTILISATEURS_GERER));
  repondre('utilisateurs:creer', (donnees) => utilisateurs.creer(bd, donnees), droit(P.UTILISATEURS_GERER));
  repondre('utilisateurs:motDePasse', ({ id, motDePasse }) => {
    // Chacun peut changer le sien ; changer celui d'autrui demande la permission comptes.
    if (id !== session.utilisateur.id) utilisateurs.exigerPermission(session.utilisateur, P.UTILISATEURS_GERER);
    utilisateurs.changerMotDePasse(bd, id, motDePasse);
    return true;
  });
  repondre('utilisateurs:activer', ({ id, actif }) => {
    if (id === session.utilisateur.id && !actif) {
      throw new Error('On ne desactive pas le compte avec lequel on travaille.');
    }
    utilisateurs.activer(bd, id, actif);
    return true;
  }, droit(P.UTILISATEURS_GERER));

  // --- Parametres ------------------------------------------------------------
  repondre('parametres:lire', () => base.lireParametres(bd));
  repondre('parametres:ecrire', (valeurs) => {
    base.ecrireParametres(bd, valeurs);
    return base.lireParametres(bd);
  }, droit(P.PARAMETRES_GERER));
}

module.exports = { enregistrerCanaux };

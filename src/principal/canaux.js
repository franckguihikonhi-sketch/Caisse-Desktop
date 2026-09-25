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
const audit = require('../donnees/audit');
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
  const repondre = (nom, traitement, { exigeSession = true, permission = null, auditer = null } = {}) => {
    ipcMain.handle(nom, async (_evenement, argument) => {
      try {
        if (exigeSession && !session.utilisateur) {
          throw new Error('Aucune session ouverte.');
        }
        if (permission) utilisateurs.exigerPermission(session.utilisateur, permission);
        const valeur = await traitement(argument);
        if (auditer) {
          const ligne = auditer(argument, valeur, session.utilisateur);
          if (ligne) audit.enregistrer(bd, { utilisateur: session.utilisateur, ...ligne });
        }
        return { ok: true, valeur };
      } catch (erreur) {
        return { ok: false, erreur: erreur.message };
      }
    });
  };

  const libre = { exigeSession: false };
  const droit = (permission, auditer = null) => ({ permission, auditer });

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
  }, { ...libre, auditer: (_a, u) => ({ action: 'creation', entite: 'utilisateur', entiteId: u.id, resume: 'Creation du premier administrateur ' + u.identifiant }) });

  repondre('session:connexion', ({ identifiant, motDePasse }) => {
    const utilisateur = utilisateurs.authentifier(bd, identifiant, motDePasse);
    if (!utilisateur) {
      audit.enregistrer(bd, {
        action: 'connexion_refusee',
        entite: 'session',
        resume: 'Tentative de connexion refusee pour ' + String(identifiant ?? '').trim(),
        details: { identifiant: String(identifiant ?? '').trim().toLowerCase() },
      });
      throw new Error('Identifiant ou mot de passe incorrect.');
    }
    session.utilisateur = utilisateur;
    return utilisateur;
  }, { ...libre, auditer: (_a, u) => ({ action: 'connexion', entite: 'session', entiteId: u.id, resume: u.nom + ' connecte' }) });

  repondre('session:deconnexion', () => {
    const utilisateur = session.utilisateur;
    audit.enregistrer(bd, {
      utilisateur,
      action: 'deconnexion',
      entite: 'session',
      entiteId: utilisateur?.id,
      resume: (utilisateur?.nom ?? 'Utilisateur') + ' deconnecte',
    });
    session.utilisateur = null;
    return true;
  }, libre);

  // --- Tableau de bord et caisse --------------------------------------------
  repondre('tableauDeBord:lire', (options) => tableauDeBord.lire(bd, options ?? {}), droit(P.DASHBOARD_LIRE));
  repondre('benefices:lister', (options) => benefices.lister(bd, options ?? {}), droit(P.RAPPORTS_BENEFICES));
  repondre('audit:lister', (options) => ({
    resume: audit.resume(bd),
    lignes: audit.lister(bd, options ?? {}),
  }), droit(P.AUDIT_LIRE));
  repondre('caisse:etat', () => caisse.etat(bd), droit(P.CAISSE_JOURNAL));
  repondre('caisse:ouvrir', (donnees) => caisse.ouvrir(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.CAISSE_GERER,
    (_a, r) => ({ action: 'ouverture', entite: 'caisse', entiteId: r.id, resume: 'Ouverture de caisse avec fond ' + r.fondOuverture + ' F' })));
  repondre('caisse:fermer', (donnees) => caisse.fermer(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.CAISSE_GERER,
    (_a, r) => ({ action: 'fermeture', entite: 'caisse', entiteId: r.id, resume: 'Fermeture de caisse, ecart ' + r.ecart + ' F' })));
  repondre('caisse:sessions', (options) => caisse.lister(bd, options ?? {}), droit(P.CAISSE_JOURNAL));

  // --- Articles --------------------------------------------------------------
  repondre('articles:lister', (options) => articles.lister(bd, options ?? {}), droit(P.ARTICLES_LIRE));
  repondre('articles:chercher', ({ texte, options }) => articles.chercher(bd, texte, options), droit(P.ARTICLES_LIRE));
  repondre('articles:parCodeBarres', ({ code }) => articles.lireParCodeBarres(bd, code), droit(P.ARTICLES_LIRE));
  repondre('articles:creer', (article) => articles.creer(bd, article), droit(P.ARTICLES_GERER,
    (_a, r) => ({ action: 'creation', entite: 'article', entiteId: r.id, resume: r.reference + ' - ' + r.designation })));
  repondre('articles:modifier', ({ id, article }) => articles.modifier(bd, id, article), droit(P.ARTICLES_GERER,
    (_a, r) => ({ action: 'modification', entite: 'article', entiteId: r.id, resume: r.reference + ' - ' + r.designation })));
  repondre('articles:retirer', ({ id }) => articles.retirer(bd, id), droit(P.ARTICLES_GERER,
    (a) => ({ action: 'retrait', entite: 'article', entiteId: a.id, resume: 'Article retire du catalogue' })));
  repondre('articles:attribuerCodeInterne', () => articles.attribuerCodeInterne(bd), droit(P.ARTICLES_GERER));
  repondre('articles:sousLeSeuil', () => articles.sousLeSeuil(bd), droit(P.STOCK_LIRE));
  repondre('stock:mouvement', (demande) => stocks.mouvement(bd, { ...demande, utilisateurId: session.utilisateur.id }), droit(P.STOCK_MOUVEMENT,
    (_a, r) => ({ action: 'mouvement', entite: 'stock', entiteId: r.id, resume: r.articleReference + ' ' + r.type + ' ' + r.quantiteLibelle, details: r })));
  repondre('stock:lister', (options) => stocks.lister(bd, options ?? {}), droit(P.STOCK_LIRE));

  // --- Clients et creances ---------------------------------------------------
  repondre('clients:lister', (options) => clients.lister(bd, options ?? {}), droit(P.CLIENTS_LIRE));
  repondre('clients:creer', (donnees) => clients.creer(bd, donnees), droit(P.CLIENTS_GERER,
    (_a, r) => ({ action: 'creation', entite: 'client', entiteId: r.id, resume: r.code + ' - ' + r.nom })));
  repondre('clients:modifier', ({ id, client }) => clients.modifier(bd, id, client), droit(P.CLIENTS_GERER,
    (_a, r) => ({ action: 'modification', entite: 'client', entiteId: r.id, resume: r.code + ' - ' + r.nom })));
  repondre('clients:retirer', ({ id }) => clients.retirer(bd, id), droit(P.CLIENTS_GERER,
    (a) => ({ action: 'retrait', entite: 'client', entiteId: a.id, resume: 'Client desactive' })));
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
  repondre('clients:creanceAnterieure', (donnees) => clients.creerCreanceAnterieure(bd, donnees), droit(P.CLIENTS_GERER,
    (_a, r) => ({ action: 'creation', entite: 'creance_client', entiteId: r.id, resume: r.numero + ' - ' + r.clientNom + ' - ' + r.montantInitial + ' F' })));
  repondre('clients:regler', (donnees) =>
    clients.enregistrerReglement(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.CLIENTS_REGLER,
      (_a, r) => ({ action: 'reglement', entite: 'creance_client', entiteId: r.creance.id, resume: 'Reglement client, solde ' + r.creance.solde + ' F', details: r })));

  // --- Fournisseurs et dettes ------------------------------------------------
  repondre('fournisseurs:lister', (options) => fournisseurs.lister(bd, options ?? {}), droit(P.FOURNISSEURS_LIRE));
  repondre('fournisseurs:creer', (donnees) => fournisseurs.creer(bd, donnees), droit(P.FOURNISSEURS_GERER,
    (_a, r) => ({ action: 'creation', entite: 'fournisseur', entiteId: r.id, resume: r.code + ' - ' + r.nom })));
  repondre('fournisseurs:modifier', ({ id, fournisseur }) => fournisseurs.modifier(bd, id, fournisseur), droit(P.FOURNISSEURS_GERER,
    (_a, r) => ({ action: 'modification', entite: 'fournisseur', entiteId: r.id, resume: r.code + ' - ' + r.nom })));
  repondre('fournisseurs:retirer', ({ id }) => fournisseurs.retirer(bd, id), droit(P.FOURNISSEURS_GERER,
    (a) => ({ action: 'retrait', entite: 'fournisseur', entiteId: a.id, resume: 'Fournisseur desactive' })));
  repondre('fournisseurs:dettes', (options) => fournisseurs.listerDettes(bd, options ?? {}), droit(P.FOURNISSEURS_LIRE));
  repondre('fournisseurs:detteAnterieure', (donnees) => fournisseurs.creerDetteAnterieure(bd, donnees), droit(P.FOURNISSEURS_GERER,
    (_a, r) => ({ action: 'creation', entite: 'dette_fournisseur', entiteId: r.id, resume: r.numero + ' - ' + r.fournisseurNom + ' - ' + r.montantInitial + ' F' })));
  repondre('fournisseurs:regler', (donnees) =>
    fournisseurs.enregistrerReglement(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.FOURNISSEURS_REGLER,
      (_a, r) => ({ action: 'reglement', entite: 'dette_fournisseur', entiteId: r.dette.id, resume: 'Reglement fournisseur, solde ' + r.dette.solde + ' F', details: r })));

  // --- Achats marchandises ---------------------------------------------------
  repondre('achats:enregistrer', (donnees) =>
    achats.enregistrer(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.ACHATS_GERER,
      (_a, r) => ({ action: 'creation', entite: 'achat', entiteId: r.id, resume: r.numero + ' - ' + r.fournisseurNom + ' - ' + r.totalTtc + ' F', details: { lignes: r.lignes?.length } })));
  repondre('achats:lister', (options) => achats.lister(bd, options ?? {}), droit(P.ACHATS_LIRE));
  repondre('achats:lire', ({ id }) => achats.lire(bd, id), droit(P.ACHATS_LIRE));
  repondre('achats:annuler', ({ id, motif }) => achats.annuler(bd, id, motif, session.utilisateur.id), droit(P.ACHATS_GERER,
    (a, r) => ({ action: 'annulation', entite: 'achat', entiteId: a.id, resume: r.numero + ' annule - ' + (a.motif || '') })));
  repondre('achats:retourner', (donnees) =>
    achats.retourner(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.ACHATS_GERER,
      (_a, r) => ({ action: 'retour', entite: 'retour_fournisseur', entiteId: r.id, resume: r.numero + ' - ' + r.totalTtc + ' F', details: { achatId: r.achatId } })));
  repondre('achats:retours', (options) => achats.listerRetours(bd, options ?? {}), droit(P.ACHATS_LIRE));
  repondre('achats:annulerRetour', ({ id, motif }) => achats.annulerRetour(bd, id, motif, session.utilisateur.id), droit(P.ACHATS_GERER,
    (a, r) => ({ action: 'annulation', entite: 'retour_fournisseur', entiteId: a.id, resume: r.numero + ' annule - ' + (a.motif || '') })));

  // --- Ventes ----------------------------------------------------------------
  repondre('ventes:enregistrer', (commande) =>
    ventes.lire(bd, ventes.enregistrer(bd, {
      ...commande,
      utilisateurId: session.utilisateur.id,
    }).id), droit(P.VENTE_ENCAISSER,
      (_a, r) => ({ action: 'creation', entite: 'vente', entiteId: r.id, resume: r.numero + ' - ' + r.panier.totalTtc + ' F', details: { lignes: r.panier.lignes.length, client: r.client?.nom || null } })));
  repondre('ventes:lire', ({ id }) => ventes.lire(bd, id), droit(P.VENTE_LIRE));
  repondre('ventes:journal', ({ jour: j } = {}) => ventes.journal(bd, j ?? jour()), droit(P.CAISSE_JOURNAL));
  repondre('ventes:cloture', ({ jour: j } = {}) => ventes.cloture(bd, j ?? jour()), droit(P.CAISSE_JOURNAL));
  repondre('ventes:annuler', ({ id, motif }) => ventes.annuler(bd, id, motif, session.utilisateur.id), droit(P.VENTE_ANNULER,
    (a, r) => ({ action: 'annulation', entite: 'vente', entiteId: a.id, resume: r.numero + ' annulee - ' + (a.motif || '') })));
  repondre('ventes:retourner', (donnees) =>
    ventes.retourner(bd, { ...donnees, utilisateurId: session.utilisateur.id }), droit(P.VENTE_RETOUR,
      (_a, r) => ({ action: 'retour', entite: 'retour_client', entiteId: r.id, resume: r.numero + ' - ' + r.totalTtc + ' F', details: { venteId: r.venteId } })));
  repondre('ventes:retours', (options) => ventes.listerRetours(bd, options ?? {}), droit(P.VENTE_RETOUR));
  repondre('ventes:annulerRetour', ({ id, motif }) => ventes.annulerRetour(bd, id, motif, session.utilisateur.id), droit(P.VENTE_RETOUR,
    (a, r) => ({ action: 'annulation', entite: 'retour_client', entiteId: a.id, resume: r.numero + ' annule - ' + (a.motif || '') })));

  // --- Utilisateurs ----------------------------------------------------------
  repondre('utilisateurs:roles', () => utilisateurs.rolesDisponibles(), droit(P.UTILISATEURS_GERER));
  repondre('utilisateurs:lister', () => utilisateurs.lister(bd), droit(P.UTILISATEURS_GERER));
  repondre('utilisateurs:creer', (donnees) => utilisateurs.creer(bd, donnees), droit(P.UTILISATEURS_GERER,
    (_a, r) => ({ action: 'creation', entite: 'utilisateur', entiteId: r.id, resume: r.identifiant + ' - ' + r.roleLibelle })));
  repondre('utilisateurs:motDePasse', ({ id, motDePasse }) => {
    // Chacun peut changer le sien ; changer celui d'autrui demande la permission comptes.
    if (id !== session.utilisateur.id) utilisateurs.exigerPermission(session.utilisateur, P.UTILISATEURS_GERER);
    utilisateurs.changerMotDePasse(bd, id, motDePasse);
    audit.enregistrer(bd, {
      utilisateur: session.utilisateur,
      action: 'mot_de_passe',
      entite: 'utilisateur',
      entiteId: id,
      resume: id === session.utilisateur.id ? 'Changement de son mot de passe' : 'Changement du mot de passe utilisateur #' + id,
    });
    return true;
  });
  repondre('utilisateurs:activer', ({ id, actif }) => {
    if (id === session.utilisateur.id && !actif) {
      throw new Error('On ne desactive pas le compte avec lequel on travaille.');
    }
    utilisateurs.activer(bd, id, actif);
    return true;
  }, droit(P.UTILISATEURS_GERER,
    (a) => ({ action: a.actif ? 'activation' : 'desactivation', entite: 'utilisateur', entiteId: a.id, resume: (a.actif ? 'Activation' : 'Desactivation') + ' du compte #' + a.id })));

  // --- Parametres ------------------------------------------------------------
  repondre('parametres:lire', () => base.lireParametres(bd));
  repondre('parametres:ecrire', (valeurs) => {
    base.ecrireParametres(bd, valeurs);
    return base.lireParametres(bd);
  }, droit(P.PARAMETRES_GERER,
    (a) => ({ action: 'modification', entite: 'parametres', resume: 'Parametres boutique modifies', details: { cles: Object.keys(a ?? {}) } })));
}

module.exports = { enregistrerCanaux };

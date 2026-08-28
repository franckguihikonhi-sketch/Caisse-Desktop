'use strict';

const { ipcMain } = require('electron');

const base = require('../donnees/base');
const utilisateurs = require('../donnees/utilisateurs');
const articles = require('../donnees/articles');
const ventes = require('../donnees/ventes');
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

  // --- Articles --------------------------------------------------------------
  repondre('articles:lister', (options) => articles.lister(bd, options ?? {}));
  repondre('articles:chercher', ({ texte, options }) => articles.chercher(bd, texte, options));
  repondre('articles:parCodeBarres', ({ code }) => articles.lireParCodeBarres(bd, code));
  repondre('articles:creer', (article) => articles.creer(bd, article), admin);
  repondre('articles:modifier', ({ id, article }) => articles.modifier(bd, id, article), admin);
  repondre('articles:retirer', ({ id }) => articles.retirer(bd, id), admin);
  repondre('articles:attribuerCodeInterne', () => articles.attribuerCodeInterne(bd), admin);
  repondre('articles:sousLeSeuil', () => articles.sousLeSeuil(bd));

  // --- Ventes ----------------------------------------------------------------
  repondre('ventes:enregistrer', (commande) =>
    ventes.lire(bd, ventes.enregistrer(bd, { ...commande, utilisateurId: session.utilisateur.id }).id));
  repondre('ventes:lire', ({ id }) => ventes.lire(bd, id));
  repondre('ventes:journal', ({ jour: j } = {}) => ventes.journal(bd, j ?? jour()));
  repondre('ventes:cloture', ({ jour: j } = {}) => ventes.cloture(bd, j ?? jour()));
  repondre('ventes:annuler', ({ id, motif }) => ventes.annuler(bd, id, motif), admin);

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

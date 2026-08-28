'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const panier = require('../metier/panier');
const monnaie = require('../metier/monnaie');
const ticket = require('../metier/ticket');
const codeBarres = require('../metier/code-barres');

/**
 * Seul pont entre la page et l'application. Le rendu ne recoit ni require, ni
 * ipcRenderer, ni acces au disque : uniquement les fonctions listees ici.
 *
 * Les calculs de panier et de monnaie sont exposes directement parce qu'ils
 * sont purs : ils servent a afficher un total pendant la saisie. La vente,
 * elle, est toujours recalculee cote principal au moment de l'enregistrement.
 */
const appeler = (canal) => (argument) => ipcRenderer.invoke(canal, argument);

contextBridge.exposeInMainWorld('caisse', {
  session: {
    etat: appeler('session:etat'),
    creerAdministrateur: appeler('session:creerAdministrateur'),
    connexion: appeler('session:connexion'),
    deconnexion: appeler('session:deconnexion'),
  },
  articles: {
    lister: appeler('articles:lister'),
    chercher: appeler('articles:chercher'),
    parCodeBarres: appeler('articles:parCodeBarres'),
    creer: appeler('articles:creer'),
    modifier: appeler('articles:modifier'),
    retirer: appeler('articles:retirer'),
    sousLeSeuil: appeler('articles:sousLeSeuil'),
  },
  ventes: {
    enregistrer: appeler('ventes:enregistrer'),
    lire: appeler('ventes:lire'),
    journal: appeler('ventes:journal'),
    cloture: appeler('ventes:cloture'),
    annuler: appeler('ventes:annuler'),
  },
  utilisateurs: {
    lister: appeler('utilisateurs:lister'),
    creer: appeler('utilisateurs:creer'),
    motDePasse: appeler('utilisateurs:motDePasse'),
    activer: appeler('utilisateurs:activer'),
  },
  parametres: {
    lire: appeler('parametres:lire'),
    ecrire: appeler('parametres:ecrire'),
  },
  ticket: {
    imprimer: appeler('ticket:imprimer'),
    pdf: appeler('ticket:pdf'),
  },
  calcul: {
    panier: (lignes, options) => panier.calculer(lignes, options),
    formater: (montant) => monnaie.formater(montant),
    rendreMonnaie: (du, recu) => monnaie.rendreMonnaie(du, recu),
    arrondirEspeces: (montant) => monnaie.arrondirEspeces(montant),
    ticket: (donnees) => ticket.construireTicket(donnees),
    verifierCodeBarres: (code) => codeBarres.verifier(code),
  },
});

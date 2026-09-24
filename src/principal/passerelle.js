'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const panier = require('../metier/panier');
const monnaie = require('../metier/monnaie');
const ticket = require('../metier/ticket');
const codeBarres = require('../metier/code-barres');
const codeBarresImage = require('../metier/code-barres-image');
const etiquettes = require('../metier/etiquettes');

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
  tableauDeBord: {
    lire: appeler('tableauDeBord:lire'),
  },
  caisseJournee: {
    etat: appeler('caisse:etat'),
    ouvrir: appeler('caisse:ouvrir'),
    fermer: appeler('caisse:fermer'),
    sessions: appeler('caisse:sessions'),
  },
  articles: {
    lister: appeler('articles:lister'),
    chercher: appeler('articles:chercher'),
    parCodeBarres: appeler('articles:parCodeBarres'),
    creer: appeler('articles:creer'),
    modifier: appeler('articles:modifier'),
    retirer: appeler('articles:retirer'),
    attribuerCodeInterne: appeler('articles:attribuerCodeInterne'),
    sousLeSeuil: appeler('articles:sousLeSeuil'),
  },
  stock: {
    mouvement: appeler('stock:mouvement'),
    lister: appeler('stock:lister'),
  },
  clients: {
    lister: appeler('clients:lister'),
    creer: appeler('clients:creer'),
    modifier: appeler('clients:modifier'),
    retirer: appeler('clients:retirer'),
    creances: appeler('clients:creances'),
    creance: appeler('clients:creance'),
    creanceAnterieure: appeler('clients:creanceAnterieure'),
    regler: appeler('clients:regler'),
  },
  fournisseurs: {
    lister: appeler('fournisseurs:lister'),
    creer: appeler('fournisseurs:creer'),
    modifier: appeler('fournisseurs:modifier'),
    retirer: appeler('fournisseurs:retirer'),
    dettes: appeler('fournisseurs:dettes'),
    detteAnterieure: appeler('fournisseurs:detteAnterieure'),
    regler: appeler('fournisseurs:regler'),
  },
  achats: {
    enregistrer: appeler('achats:enregistrer'),
    lister: appeler('achats:lister'),
    lire: appeler('achats:lire'),
    annuler: appeler('achats:annuler'),
    retourner: appeler('achats:retourner'),
    retours: appeler('achats:retours'),
    annulerRetour: appeler('achats:annulerRetour'),
  },
  ventes: {
    enregistrer: appeler('ventes:enregistrer'),
    lire: appeler('ventes:lire'),
    journal: appeler('ventes:journal'),
    cloture: appeler('ventes:cloture'),
    annuler: appeler('ventes:annuler'),
    retourner: appeler('ventes:retourner'),
    retours: appeler('ventes:retours'),
    annulerRetour: appeler('ventes:annulerRetour'),
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
  base: {
    infos: appeler('base:infos'),
    choisirDossier: appeler('base:choisirDossier'),
    retablirLocale: appeler('base:retablirLocale'),
    redemarrer: appeler('base:redemarrer'),
  },
  ticket: {
    imprimer: appeler('ticket:imprimer'),
    pdf: appeler('ticket:pdf'),
  },
  etiquettes: {
    formats: () => etiquettes.FORMATS,
    imprimer: appeler('etiquettes:imprimer'),
    pdf: appeler('etiquettes:pdf'),
  },
  calcul: {
    panier: (lignes, options) => panier.calculer(lignes, options),
    formater: (montant) => monnaie.formater(montant),
    rendreMonnaie: (du, recu) => monnaie.rendreMonnaie(du, recu),
    arrondirEspeces: (montant) => monnaie.arrondirEspeces(montant),
    ticket: (donnees) => ticket.construireTicket(donnees),
    verifierCodeBarres: (code) => codeBarres.verifier(code),
    codeBarresEnSvg: (code, options) => codeBarresImage.enSvg(code, options),
    codeBarresDessinable: (code) => codeBarresImage.estDessinable(code),
    codeBarresUsageInterne: (code) => codeBarres.estUsageInterne(code),
  },
});

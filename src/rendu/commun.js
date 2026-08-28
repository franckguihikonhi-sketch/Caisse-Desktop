'use strict';

/* Outils partages par les quatre ecrans. Aucun acces au disque ni a la base :
   tout passe par window.caisse, le pont expose par le processus principal. */

const App = {
  utilisateur: null,
  boutique: null,
  parametres: {},
};

const $ = (selecteur) => document.querySelector(selecteur);
const $$ = (selecteur) => [...document.querySelectorAll(selecteur)];

const formater = (montant) => window.caisse.calcul.formater(montant);

/**
 * Deroule une reponse {ok, valeur|erreur} des canaux. Une erreur metier remonte
 * comme une exception porteuse du message affichable.
 */
async function appeler(promesse) {
  const reponse = await promesse;
  if (!reponse.ok) throw new Error(reponse.erreur);
  return reponse.valeur;
}

function afficherMessage(element, texte, type = 'erreur') {
  element.textContent = texte;
  element.className = 'message ' + type + (texte ? ' visible' : '');
}

/** Construit un element sans passer par innerHTML : rien d'injectable. */
function creer(balise, options = {}, enfants = []) {
  const element = document.createElement(balise);
  if (options.classe) element.className = options.classe;
  if (options.texte !== undefined) element.textContent = options.texte;
  for (const [cle, valeur] of Object.entries(options.attributs ?? {})) {
    element.setAttribute(cle, valeur);
  }
  for (const [evenement, traitement] of Object.entries(options.sur ?? {})) {
    element.addEventListener(evenement, traitement);
  }
  for (const enfant of enfants) element.append(enfant);
  return element;
}

function vider(element) {
  while (element.firstChild) element.firstChild.remove();
}

/** Boite modale. Rend une promesse resolue a la fermeture. */
function ouvrirBoite(construire) {
  const voile = $('#voile');
  const boite = $('#boite');
  vider(boite);

  return new Promise((resoudre) => {
    const fermer = (valeur) => {
      voile.classList.remove('visible');
      document.removeEventListener('keydown', surEchappement);
      resoudre(valeur);
    };
    const surEchappement = (evenement) => {
      if (evenement.key === 'Escape') fermer(null);
    };

    boite.append(construire(fermer));
    voile.classList.add('visible');
    document.addEventListener('keydown', surEchappement);
    const premier = boite.querySelector('input, select, button');
    if (premier) premier.focus();
  });
}

function confirmer(titre, texte, libelle = 'Confirmer') {
  return ouvrirBoite((fermer) =>
    creer('div', {}, [
      creer('h3', { texte: titre }),
      creer('p', { texte }),
      creer('div', { classe: 'actions' }, [
        creer('button', {
          classe: 'bouton discret', texte: 'Annuler', sur: { click: () => fermer(false) },
        }),
        creer('button', {
          classe: 'bouton danger', texte: libelle, sur: { click: () => fermer(true) },
        }),
      ]),
    ])
  );
}

/**
 * Annonce breve en haut de l'ecran de vente. Le caissier qui scanne regarde ses
 * articles, pas l'ecran : il lui faut un retour qui s'impose et s'efface seul.
 */
let effacementAnnonce = null;

function annoncer(texte, type = 'succes') {
  const zone = $('#annonce');
  if (!zone) return;
  clearTimeout(effacementAnnonce);
  zone.textContent = texte;
  zone.className = 'annonce ' + type + ' visible';
  effacementAnnonce = setTimeout(() => zone.classList.remove('visible'), 3500);
}

function heureDe(horodatage) {
  return String(horodatage).slice(11, 16);
}

const LIBELLES_PAIEMENT = { especes: 'Especes', mobile: 'Mobile money', carte: 'Carte' };

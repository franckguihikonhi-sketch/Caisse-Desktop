'use strict';

/**
 * Calcul du panier. Les prix saisis en boutique sont des prix TTC : c'est le
 * montant que le client paie, et c'est lui qui doit tomber juste. La base HT et
 * la TVA en sont deduites, taux par taux.
 *
 * Toute la difficulte est l'arrondi. Un ticket ou la somme des lignes ne fait
 * pas le total est un ticket faux, meme d'un franc. On arrondit donc les lignes
 * par la methode du plus fort reste, de sorte que leur somme soit exactement le
 * total arrondi ; puis on deduit la TVA du TTC de chaque taux, ce qui garantit
 * base + TVA = TTC sans reste.
 */

const { arrondirAuFranc } = require('./monnaie');

/**
 * Arrondit une liste de valeurs a l'entier en conservant la somme :
 * la somme des entiers rendus vaut l'arrondi de la somme des valeurs.
 */
function repartirArrondi(valeurs) {
  const planchers = valeurs.map((v) => Math.floor(v));
  const cible = arrondirAuFranc(valeurs.reduce((s, v) => s + v, 0));
  let aDistribuer = cible - planchers.reduce((s, v) => s + v, 0);

  const ordre = valeurs
    .map((v, i) => ({ i, reste: v - Math.floor(v) }))
    .sort((a, b) => b.reste - a.reste || a.i - b.i);

  const resultat = planchers.slice();
  for (const { i } of ordre) {
    if (aDistribuer <= 0) break;
    resultat[i] += 1;
    aDistribuer -= 1;
  }
  return resultat;
}

function verifierLigne(ligne, rang) {
  const ou = 'ligne ' + (rang + 1);
  if (!ligne || typeof ligne !== 'object') {
    throw new TypeError(ou + ' : ligne absente.');
  }
  if (!Number.isFinite(ligne.prixUnitaire) || ligne.prixUnitaire < 0) {
    throw new RangeError(ou + ' : prix unitaire invalide.');
  }
  if (!Number.isInteger(ligne.quantite) || ligne.quantite <= 0) {
    throw new RangeError(ou + ' : la quantite doit etre un entier positif.');
  }
  const remise = ligne.remisePourcent ?? 0;
  if (!Number.isFinite(remise) || remise < 0 || remise > 100) {
    throw new RangeError(ou + ' : remise hors de 0 a 100 %.');
  }
  const taux = ligne.tauxTva ?? 0;
  if (!Number.isFinite(taux) || taux < 0) {
    throw new RangeError(ou + ' : taux de TVA invalide.');
  }
}

/**
 * @param {Array} lignes  {reference, designation, prixUnitaire, quantite, tauxTva, remisePourcent}
 * @param {Object} [options]  {remiseGlobalePourcent}
 */
function calculer(lignes, options = {}) {
  if (!Array.isArray(lignes)) {
    throw new TypeError('Le panier doit etre une liste de lignes.');
  }
  const remiseGlobale = options.remiseGlobalePourcent ?? 0;
  if (!Number.isFinite(remiseGlobale) || remiseGlobale < 0 || remiseGlobale > 100) {
    throw new RangeError('Remise globale hors de 0 a 100 %.');
  }
  lignes.forEach(verifierLigne);

  const brut = lignes.map((l) => l.prixUnitaire * l.quantite);
  const facteurGlobal = 1 - remiseGlobale / 100;
  const netsExacts = lignes.map(
    (l, i) => brut[i] * (1 - (l.remisePourcent ?? 0) / 100) * facteurGlobal
  );
  const nets = repartirArrondi(netsExacts);

  const parTaux = new Map();
  lignes.forEach((l, i) => {
    const taux = l.tauxTva ?? 0;
    parTaux.set(taux, (parTaux.get(taux) ?? 0) + nets[i]);
  });

  const ventilation = [...parTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, ttc]) => {
      const base = arrondirAuFranc(ttc / (1 + taux / 100));
      return { taux, base, tva: ttc - base, ttc };
    });

  const totalBrut = arrondirAuFranc(brut.reduce((s, v) => s + v, 0));
  const totalTtc = nets.reduce((s, v) => s + v, 0);

  return {
    lignes: lignes.map((l, i) => ({
      reference: l.reference,
      designation: l.designation,
      prixUnitaire: l.prixUnitaire,
      quantite: l.quantite,
      tauxTva: l.tauxTva ?? 0,
      remisePourcent: l.remisePourcent ?? 0,
      totalTtc: nets[i],
    })),
    nombreArticles: lignes.reduce((s, l) => s + l.quantite, 0),
    totalBrut,
    remise: totalBrut - totalTtc,
    totalTtc,
    totalHt: ventilation.reduce((s, v) => s + v.base, 0),
    totalTva: ventilation.reduce((s, v) => s + v.tva, 0),
    ventilation,
  };
}

module.exports = { calculer, repartirArrondi };

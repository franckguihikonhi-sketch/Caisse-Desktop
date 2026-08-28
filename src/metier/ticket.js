'use strict';

/**
 * Mise en forme du ticket de caisse pour une imprimante thermique 58 mm,
 * soit 32 caracteres par ligne. Fonction pure : elle rend un tableau de lignes
 * de texte, ce qui la rend verifiable sans imprimante ni fenetre.
 */

const { formater } = require('./monnaie');

const LARGEUR = 32;

function centrer(texte, largeur = LARGEUR) {
  const t = texte.slice(0, largeur);
  const marge = Math.max(0, Math.floor((largeur - t.length) / 2));
  return ' '.repeat(marge) + t;
}

function justifier(gauche, droite, largeur = LARGEUR) {
  const g = String(gauche);
  const d = String(droite);
  if (g.length + d.length + 1 > largeur) {
    return (g.slice(0, largeur - d.length - 1) + ' ' + d).slice(0, largeur);
  }
  return g + ' '.repeat(largeur - g.length - d.length) + d;
}

function separateur(caractere = '-') {
  return caractere.repeat(LARGEUR);
}

function dateLisible(iso) {
  const d = new Date(iso);
  const deuxChiffres = (n) => String(n).padStart(2, '0');
  return (
    deuxChiffres(d.getDate()) + '/' + deuxChiffres(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + deuxChiffres(d.getHours()) + ':' + deuxChiffres(d.getMinutes())
  );
}

const LIBELLES_PAIEMENT = {
  especes: 'Especes',
  mobile: 'Mobile money',
  carte: 'Carte bancaire',
};

function construireTicket({ boutique, vente }) {
  const lignes = [];
  const pousser = (t) => lignes.push(t);

  pousser(centrer(boutique.nom.toUpperCase()));
  if (boutique.adresse) pousser(centrer(boutique.adresse));
  if (boutique.telephone) pousser(centrer('Tel. ' + boutique.telephone));
  if (boutique.numeroContribuable) pousser(centrer('NCC ' + boutique.numeroContribuable));
  pousser(separateur('='));

  pousser(justifier('Ticket', vente.numero));
  pousser(justifier(dateLisible(vente.date), vente.caissier));
  pousser(separateur());

  for (const l of vente.panier.lignes) {
    pousser(l.designation.slice(0, LARGEUR));
    const detail = l.quantite + ' x ' + formater(l.prixUnitaire);
    pousser(justifier('  ' + detail, formater(l.totalTtc)));
    if (l.remisePourcent > 0) {
      pousser('  remise ' + l.remisePourcent + ' %');
    }
  }

  pousser(separateur());
  if (vente.panier.remise > 0) {
    pousser(justifier('Sous-total', formater(vente.panier.totalBrut)));
    pousser(justifier('Remise', '-' + formater(vente.panier.remise)));
  }
  pousser(justifier('TOTAL', formater(vente.panier.totalTtc)));
  pousser('');

  for (const v of vente.panier.ventilation) {
    pousser(justifier('  HT ' + v.taux + ' %', formater(v.base)));
    if (v.tva > 0) pousser(justifier('  TVA ' + v.taux + ' %', formater(v.tva)));
  }

  pousser(separateur());
  pousser(justifier(LIBELLES_PAIEMENT[vente.paiement.mode] ?? vente.paiement.mode,
    formater(vente.paiement.montantRecu ?? vente.panier.totalTtc)));
  if (vente.paiement.mode === 'especes') {
    pousser(justifier('Monnaie rendue', formater(vente.paiement.rendu ?? 0)));
  }

  pousser('');
  pousser(centrer('Merci de votre visite'));
  pousser(centrer('A bientot'));

  return lignes;
}

module.exports = { construireTicket, centrer, justifier, LARGEUR };

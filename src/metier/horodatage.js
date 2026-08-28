'use strict';

/**
 * Une caisse raisonne en heure locale : la journee de vente se ferme quand le
 * magasin ferme, pas a minuit UTC. Les dates sont donc ecrites en heure locale,
 * sans fuseau (AAAA-MM-JJTHH:MM:SS), forme que SQLite sait decouper avec
 * date() et que l'on relit sans conversion.
 */

const deuxChiffres = (n) => String(n).padStart(2, '0');

function horodater(date = new Date()) {
  return (
    date.getFullYear() + '-' + deuxChiffres(date.getMonth() + 1) + '-' +
    deuxChiffres(date.getDate()) + 'T' + deuxChiffres(date.getHours()) + ':' +
    deuxChiffres(date.getMinutes()) + ':' + deuxChiffres(date.getSeconds())
  );
}

/** Le jour d'une date, au format AAAA-MM-JJ. */
function jour(date = new Date()) {
  return horodater(date instanceof Date ? date : new Date(date)).slice(0, 10);
}

/** Le jour d'un horodatage deja ecrit en base, sans repasser par Date. */
function jourDe(horodatage) {
  return String(horodatage).slice(0, 10);
}

module.exports = { horodater, jour, jourDe };

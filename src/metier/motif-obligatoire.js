'use strict';

function exigerMotif(valeur, action = 'Cette operation') {
  const motif = String(valeur ?? '').trim();
  if (!motif) {
    throw new RangeError(action + ' exige un motif obligatoire pour l historique.');
  }
  if (motif.length > 240) {
    throw new RangeError('Le motif ne doit pas depasser 240 caracteres.');
  }
  return motif;
}

module.exports = { exigerMotif };

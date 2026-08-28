'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cb = require('../src/metier/code-barres');

// Codes reellement imprimes sur des produits du commerce.
const NUTELLA = '3017620422003';
const COCA = '5449000000996';
const EAN8 = '96385074';
const UPCA = '012345678905';

test('les codes du commerce sont reconnus et types', () => {
  assert.deepEqual(cb.verifier(NUTELLA), { valide: true, code: NUTELLA, type: 'EAN-13' });
  assert.equal(cb.verifier(COCA).type, 'EAN-13');
  assert.equal(cb.verifier(EAN8).type, 'EAN-8');
  assert.equal(cb.verifier(UPCA).type, 'UPC-A');
});

test('une cle fausse est refusee, avec le chiffre attendu', () => {
  const verdict = cb.verifier('3017620422004');
  assert.equal(verdict.valide, false);
  assert.match(verdict.motif, /EAN-13/);
  assert.match(verdict.motif, /3 etait attendu/);
});

test('la cle attrape les inversions de chiffres voisins, sauf celles d ecart 5', () => {
  // C'est tout l'interet de la cle, et sa seule limite : les poids 1 et 3
  // different de 2, et 2 x 5 = 10 ne change rien modulo 10.
  const codes = [NUTELLA, COCA, '4006381333931', '8712100849718', '3068320114774'];
  let inversions = 0;

  for (const code of codes) {
    const chiffres = [...code];
    for (let i = 0; i < chiffres.length - 1; i += 1) {
      const permute = [...chiffres];
      [permute[i], permute[i + 1]] = [permute[i + 1], permute[i]];
      const faute = permute.join('');
      if (faute === code) continue;

      inversions += 1;
      const ecart = Math.abs(Number(chiffres[i]) - Number(chiffres[i + 1]));
      const attrapee = !cb.verifier(faute).valide;
      assert.equal(
        attrapee, ecart !== 5,
        code + ' : ' + chiffres[i] + '<->' + chiffres[i + 1] + ' (ecart ' + ecart + ')'
      );
    }
  }
  assert.ok(inversions > 40, 'echantillon trop maigre : ' + inversions);
});

test('les espaces et tirets des etiquettes sont ignores', () => {
  assert.equal(cb.verifier('3017620 422003').code, NUTELLA);
  assert.equal(cb.verifier('3-017620-422003').code, NUTELLA);
});

test('un code libre passe, faute de cle a verifier', () => {
  const verdict = cb.verifier('12345');
  assert.equal(verdict.valide, true);
  assert.equal(verdict.type, 'libre');
});

test('un code d usage interne est un EAN-13 complet, donc imprimable', () => {
  for (const numero of [1, 7, 42, 1000, 99999]) {
    const code = cb.construireCodeInterne(numero);
    const verdict = cb.verifier(code);
    assert.equal(verdict.valide, true, code);
    assert.equal(verdict.type, 'EAN-13', code);
    assert.equal(code.length, 13);
    assert.ok(code.startsWith('2'), code + ' devrait porter le prefixe reserve');
    assert.equal(cb.estUsageInterne(code), true);
  }
});

test('deux numeros d ordre donnent deux codes differents', () => {
  const codes = new Set();
  for (let n = 1; n <= 500; n += 1) codes.add(cb.construireCodeInterne(n));
  assert.equal(codes.size, 500);
});

test('le code d un fabricant n est pas un code d usage interne', () => {
  assert.equal(cb.estUsageInterne('3017620422003'), false);
  assert.equal(cb.estUsageInterne('5449000000996'), false);
  // Un preteur de prefixe 2 dont la cle est fausse n'en est pas un non plus.
  assert.equal(cb.estUsageInterne('2000000000016'), false);
  assert.equal(cb.estUsageInterne('12345'), false);
});

test('un numero d ordre aberrant est refuse', () => {
  assert.throws(() => cb.construireCodeInterne(0), /entier positif/);
  assert.throws(() => cb.construireCodeInterne(-1), /entier positif/);
  assert.throws(() => cb.construireCodeInterne(1.5), /entier positif/);
});

test('ce qui n est pas un code-barres est refuse', () => {
  assert.match(cb.verifier('').motif, /vide/);
  assert.match(cb.verifier('abc123').motif, /que des chiffres/);
  assert.match(cb.verifier('123').motif, /trop court/);
  assert.match(cb.verifier('1'.repeat(30)).motif, /trop long/);
});

test('completer fabrique un code dont la cle tombe juste', () => {
  for (const corps of ['301762042200', '9638507', '01234567890']) {
    const code = cb.completer(corps);
    assert.equal(cb.verifier(code).valide, true, corps);
  }
  assert.equal(cb.completer('301762042200'), NUTELLA);
});

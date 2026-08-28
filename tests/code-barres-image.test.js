'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const img = require('../src/metier/code-barres-image');

// Tables publiees (Wikipedia, « International Article Number »). Elles ne sont
// pas dans le code : il ne garde que L et derive les deux autres. Les comparer
// ici verifie la derivation contre la source.
const G_PUBLIEE = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const R_PUBLIEE = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];

test('les tables derivees sont celles de la norme', () => {
  assert.deepEqual(img.G, G_PUBLIEE);
  assert.deepEqual(img.R, R_PUBLIEE);
});

test('chaque motif fait sept modules', () => {
  for (const table of [img.L, img.G, img.R]) {
    for (const motif of table) assert.equal(motif.length, 7);
  }
});

test('la parite distingue les tables, c est ce qui porte le premier chiffre', () => {
  img.L.forEach((motif, chiffre) => {
    const sombres = [...motif].filter((m) => m === '1').length;
    assert.equal(sombres % 2, 1, 'L' + chiffre + ' devrait etre de parite impaire');
    assert.equal([...img.G[chiffre]].filter((m) => m === '1').length % 2, 0);
  });
});

test('un EAN-13 fait 95 modules, gardes comprises', () => {
  const { modules } = img.encoder('5901234123457');
  assert.equal(modules.length, 95);
  assert.equal(modules.slice(0, 3), '101');
  assert.equal(modules.slice(45, 50), '01010');
  assert.equal(modules.slice(-3), '101');
});

test('un EAN-8 fait 67 modules', () => {
  const { modules } = img.encoder('96385074');
  assert.equal(modules.length, 67);
  assert.equal(modules.slice(31, 36), '01010');
});

test('un UPC-A se dessine comme l EAN-13 qui lui correspond', () => {
  assert.equal(img.encoder('012345678905').modules, img.encoder('0012345678905').modules);
});

/**
 * Decodeur independant : il relit les barres sans rien savoir de l'encodeur,
 * en retrouvant le premier chiffre par l'alternance des parites. Si les deux
 * se rejoignent sur des codes reels, le trace est juste.
 */
function decoderEan13(modules) {
  assert.equal(modules.length, 95);
  const motif = (i) => modules.slice(3 + i * 7, 3 + (i + 1) * 7);
  const motifDroite = (i) => modules.slice(50 + i * 7, 50 + (i + 1) * 7);

  let alternance = '';
  const gauche = [];
  for (let i = 0; i < 6; i += 1) {
    const m = motif(i);
    const dansL = img.L.indexOf(m);
    if (dansL >= 0) { alternance += 'L'; gauche.push(dansL); continue; }
    const dansG = img.G.indexOf(m);
    assert.ok(dansG >= 0, 'motif gauche inconnu : ' + m);
    alternance += 'G';
    gauche.push(dansG);
  }

  const premier = img.ALTERNANCES.indexOf(alternance);
  assert.ok(premier >= 0, 'alternance inconnue : ' + alternance);

  const droite = [];
  for (let i = 0; i < 6; i += 1) {
    const trouve = img.R.indexOf(motifDroite(i));
    assert.ok(trouve >= 0, 'motif droit inconnu');
    droite.push(trouve);
  }
  return String(premier) + gauche.join('') + droite.join('');
}

test('relire les barres redonne le code, sur des codes reels', () => {
  for (const code of [
    '5901234123457', '3017620422003', '5449000000996',
    '4006381333931', '8712100849718', '0012345678905',
  ]) {
    assert.equal(decoderEan13(img.encoder(code).modules), code, code);
  }
});

test('un code interne ne se dessine pas, et le dit', () => {
  assert.equal(img.estDessinable('12345'), false);
  assert.throws(() => img.encoder('12345'), /ne se dessine pas/);
  assert.equal(img.estDessinable('3017620422003'), true);
  assert.equal(img.estDessinable('3017620422004'), false);
});

test('le SVG porte les barres et les chiffres lisibles', () => {
  const svg = img.enSvg('3017620422003');
  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 113 76"/);
  assert.ok(svg.includes('>3<'), 'le premier chiffre doit figurer a gauche');
  assert.ok(svg.includes('>017620<'));
  assert.ok(svg.includes('>422003<'));
  // Une barre d'un module de large par module sombre, le fond blanc en plus.
  const sombres = [...img.encoder('3017620422003').modules].filter((m) => m === '1').length;
  assert.equal(svg.match(/<rect x="\d+" y="0" width="1"/g).length, sombres);
  assert.equal(svg.match(/fill="#fff"/g).length, 1);
});

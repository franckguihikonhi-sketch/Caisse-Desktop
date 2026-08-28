'use strict';

/**
 * Planches d'etiquettes code-barres.
 *
 * La page est construite en millimetres, parce qu'une etiquette se decolle
 * d'une planche reelle : si la grille ne tombe pas juste, tout est decale. Les
 * formats retenus sont ceux qu'on trouve en papeterie, avec leurs marges.
 *
 * Fonction pure : elle rend du HTML autonome, styles et codes-barres compris.
 * Rien n'est charge de l'exterieur, la page s'imprime hors ligne.
 */

const { enSvg, estDessinable } = require('./code-barres-image');
const { formater } = require('./monnaie');

const FORMATS = {
  'a4-65': {
    intitule: 'A4 - 65 etiquettes (38,1 x 21,2 mm)',
    page: { largeur: 210, hauteur: 297 },
    marges: { haut: 10.7, gauche: 4.75 },
    etiquette: { largeur: 38.1, hauteur: 21.2 },
    grille: { colonnes: 5, lignes: 13 },
    ecart: { colonnes: 2.5, lignes: 0 },
    police: { designation: 5.4, prix: 7, hauteurBarres: 34 },
  },
  'a4-24': {
    intitule: 'A4 - 24 etiquettes (63,5 x 33,9 mm)',
    page: { largeur: 210, hauteur: 297 },
    marges: { haut: 12.7, gauche: 7.75 },
    etiquette: { largeur: 63.5, hauteur: 33.9 },
    grille: { colonnes: 3, lignes: 8 },
    ecart: { colonnes: 2.5, lignes: 0 },
    police: { designation: 7.5, prix: 10, hauteurBarres: 44 },
  },
  'rouleau-40x30': {
    intitule: 'Rouleau - 40 x 30 mm, une par page',
    page: { largeur: 40, hauteur: 30 },
    marges: { haut: 1, gauche: 1 },
    etiquette: { largeur: 38, hauteur: 28 },
    grille: { colonnes: 1, lignes: 1 },
    ecart: { colonnes: 0, lignes: 0 },
    police: { designation: 6, prix: 8, hauteurBarres: 40 },
  },
};

const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const echapper = (texte) => String(texte ?? '').replace(/[&<>"]/g, (c) => ECHAPPEMENTS[c]);

/**
 * Deplie les articles en etiquettes, une par exemplaire demande, et ecarte
 * ceux qu'on ne sait pas dessiner en disant pourquoi.
 */
function preparer(articles) {
  const etiquettes = [];
  const ecartes = [];

  for (const article of articles) {
    const nombre = Number(article.quantite ?? 1);
    if (!Number.isInteger(nombre) || nombre < 1) {
      throw new RangeError(
        'Nombre d etiquettes invalide pour ' + article.designation + ' : ' + article.quantite + '.'
      );
    }
    if (!article.codeBarres) {
      ecartes.push({ article, motif: 'pas de code-barres' });
      continue;
    }
    if (!estDessinable(article.codeBarres)) {
      ecartes.push({ article, motif: 'code interne, sans trace normalise' });
      continue;
    }
    for (let i = 0; i < nombre; i += 1) etiquettes.push(article);
  }
  return { etiquettes, ecartes };
}

function construirePage({ articles, boutique = null, format = 'a4-65', avecPrix = true }) {
  const reglage = FORMATS[format];
  if (!reglage) throw new RangeError('Format d etiquettes inconnu : ' + format + '.');

  const { etiquettes, ecartes } = preparer(articles);
  if (etiquettes.length === 0) {
    throw new RangeError(
      'Aucune etiquette a imprimer : ' +
        (ecartes.length > 0 ? 'aucun des articles choisis ne porte de code-barres dessinable.'
          : 'aucun article choisi.')
    );
  }

  const parPage = reglage.grille.colonnes * reglage.grille.lignes;
  const pages = [];
  for (let debut = 0; debut < etiquettes.length; debut += parPage) {
    pages.push(etiquettes.slice(debut, debut + parPage));
  }

  const cellules = (page) => page.map((article) => {
    const lignes = [];
    if (boutique?.nom) {
      lignes.push('<div class="boutique">' + echapper(boutique.nom) + '</div>');
    }
    lignes.push('<div class="designation">' + echapper(article.designation) + '</div>');
    lignes.push('<div class="barres">' +
      enSvg(article.codeBarres, { hauteurBarres: reglage.police.hauteurBarres }) + '</div>');
    if (avecPrix) {
      lignes.push('<div class="prix">' + echapper(formater(article.prixUnitaire)) + '</div>');
    }
    return '<div class="etiquette">' + lignes.join('') + '</div>';
  }).join('');

  const html = pages.map((page) => '<section class="planche">' + cellules(page) + '</section>').join('');

  return {
    html: enveloppe(reglage, html),
    nombreEtiquettes: etiquettes.length,
    nombrePages: pages.length,
    ecartes,
  };
}

function enveloppe(reglage, contenu) {
  const { page, marges, etiquette, grille, ecart, police } = reglage;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Etiquettes</title>
<style>
  @page { size: ${page.largeur}mm ${page.hauteur}mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }

  .planche {
    width: ${page.largeur}mm;
    height: ${page.hauteur}mm;
    padding: ${marges.haut}mm 0 0 ${marges.gauche}mm;
    display: grid;
    grid-template-columns: repeat(${grille.colonnes}, ${etiquette.largeur}mm);
    grid-auto-rows: ${etiquette.hauteur}mm;
    column-gap: ${ecart.colonnes}mm;
    row-gap: ${ecart.lignes}mm;
    page-break-after: always;
  }
  .planche:last-child { page-break-after: auto; }

  .etiquette {
    width: ${etiquette.largeur}mm;
    height: ${etiquette.hauteur}mm;
    padding: 0.8mm 1mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    overflow: hidden;
  }

  .boutique {
    font-size: ${(police.designation * 0.85).toFixed(2)}pt;
    line-height: 1.1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .designation {
    width: 100%;
    font-size: ${police.designation}pt;
    line-height: 1.15;
    font-weight: 700;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .barres { flex: 1; min-height: 0; width: 100%; display: flex; justify-content: center; }
  .barres svg { height: 100%; max-width: 100%; }

  .prix { font-size: ${police.prix}pt; font-weight: 700; line-height: 1.1; }
</style></head><body>${contenu}</body></html>`;
}

module.exports = { FORMATS, construirePage, preparer };

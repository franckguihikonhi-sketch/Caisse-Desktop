'use strict';

const crypto = require('node:crypto');

/**
 * Les mots de passe ne sont jamais stockes : on garde un sel et l'empreinte
 * scrypt correspondante, et on compare en temps constant.
 */
const LONGUEUR_EMPREINTE = 64;
const LONGUEUR_MIN_MOT_DE_PASSE = 3;
const ACCES_STANDARD = Object.freeze({
  identifiant: 'CIV',
  motDePasse: 'CIV',
  nom: 'Administrateur',
  role: 'administrateur',
});

function empreinter(motDePasse, sel) {
  return crypto.scryptSync(motDePasse, sel, LONGUEUR_EMPREINTE).toString('hex');
}

function comparer(attendue, calculee) {
  const a = Buffer.from(attendue, 'hex');
  const b = Buffer.from(calculee, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function aucunCompte(base) {
  return base.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get().n === 0;
}

function creer(base, { identifiant, nom, role, motDePasse }) {
  const id = String(identifiant ?? '').trim().toLowerCase();
  if (id.length < 3) throw new RangeError("L'identifiant doit faire au moins 3 caracteres.");
  if (!nom || !String(nom).trim()) throw new RangeError('Le nom est obligatoire.');
  if (!['administrateur', 'caissier'].includes(role)) throw new RangeError('Role inconnu.');
  if (typeof motDePasse !== 'string' || motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new RangeError('Le mot de passe doit faire au moins ' + LONGUEUR_MIN_MOT_DE_PASSE + ' caracteres.');
  }
  const sel = crypto.randomBytes(16).toString('hex');
  try {
    const r = base
      .prepare(
        'INSERT INTO utilisateurs (identifiant, nom, role, empreinte, sel, cree_le) ' +
          'VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, String(nom).trim(), role, empreinter(motDePasse, sel), sel, new Date().toISOString());
    return { id: r.lastInsertRowid, identifiant: id, nom: String(nom).trim(), role };
  } catch (erreur) {
    if (String(erreur.message).includes('UNIQUE')) {
      throw new RangeError('Cet identifiant est deja pris.');
    }
    throw erreur;
  }
}

function authentifier(base, identifiant, motDePasse) {
  const ligne = base
    .prepare('SELECT * FROM utilisateurs WHERE identifiant = ? AND actif = 1')
    .get(String(identifiant ?? '').trim().toLowerCase());
  if (!ligne) return null;
  if (!comparer(ligne.empreinte, empreinter(motDePasse ?? '', ligne.sel))) return null;
  return { id: ligne.id, identifiant: ligne.identifiant, nom: ligne.nom, role: ligne.role };
}

function accesStandardExiste(base) {
  return Boolean(base.prepare('SELECT 1 FROM utilisateurs WHERE identifiant = ?').get('civ'));
}

function assurerAccesStandard(base) {
  // Une ancienne base peut deja contenir des utilisateurs crees avant
  // l'introduction de l'acces standard. Dans ce cas on ajoute CIV/CIV sans
  // toucher aux comptes existants. Si le compte CIV existe deja, on ne remet
  // jamais son mot de passe a CIV : cela respecte le changement fait par
  // l'entreprise apres la premiere connexion.
  if (accesStandardExiste(base)) return null;
  return creer(base, ACCES_STANDARD);
}

function lister(base) {
  return base
    .prepare('SELECT id, identifiant, nom, role, actif FROM utilisateurs ORDER BY nom')
    .all();
}

function changerMotDePasse(base, id, motDePasse) {
  if (typeof motDePasse !== 'string' || motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new RangeError('Le mot de passe doit faire au moins ' + LONGUEUR_MIN_MOT_DE_PASSE + ' caracteres.');
  }
  const sel = crypto.randomBytes(16).toString('hex');
  base
    .prepare('UPDATE utilisateurs SET empreinte = ?, sel = ? WHERE id = ?')
    .run(empreinter(motDePasse, sel), sel, id);
}

function activer(base, id, actif) {
  base.prepare('UPDATE utilisateurs SET actif = ? WHERE id = ?').run(actif ? 1 : 0, id);
}

module.exports = {
  ACCES_STANDARD,
  LONGUEUR_MIN_MOT_DE_PASSE,
  aucunCompte,
  accesStandardExiste,
  assurerAccesStandard,
  creer,
  authentifier,
  lister,
  changerMotDePasse,
  activer,
};

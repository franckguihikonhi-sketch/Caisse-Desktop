'use strict';

const crypto = require('node:crypto');

/**
 * Les mots de passe ne sont jamais stockes : on garde un sel et l'empreinte
 * scrypt correspondante, et on compare en temps constant.
 */
const LONGUEUR_EMPREINTE = 64;
const LONGUEUR_MIN_MOT_DE_PASSE = 3;

const PERMISSIONS = Object.freeze({
  DASHBOARD_LIRE: 'dashboard:lire',
  VENTE_ENCAISSER: 'vente:encaisser',
  VENTE_LIRE: 'vente:lire',
  VENTE_ANNULER: 'vente:annuler',
  VENTE_RETOUR: 'vente:retour',
  CAISSE_GERER: 'caisse:gerer',
  CAISSE_JOURNAL: 'caisse:journal',
  ARTICLES_LIRE: 'articles:lire',
  ARTICLES_GERER: 'articles:gerer',
  STOCK_LIRE: 'stock:lire',
  STOCK_MOUVEMENT: 'stock:mouvement',
  CLIENTS_LIRE: 'clients:lire',
  CLIENTS_GERER: 'clients:gerer',
  CLIENTS_REGLER: 'clients:regler',
  FOURNISSEURS_LIRE: 'fournisseurs:lire',
  FOURNISSEURS_GERER: 'fournisseurs:gerer',
  FOURNISSEURS_REGLER: 'fournisseurs:regler',
  ACHATS_LIRE: 'achats:lire',
  ACHATS_GERER: 'achats:gerer',
  RAPPORTS_BENEFICES: 'rapports:benefices',
  RAPPORTS_EXPORTS: 'rapports:exports',
  AUDIT_LIRE: 'audit:lire',
  UTILISATEURS_GERER: 'utilisateurs:gerer',
  PARAMETRES_GERER: 'parametres:gerer',
  BASE_GERER: 'base:gerer',
});

const TOUTES_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const DEFINITIONS_ROLES = Object.freeze({
  administrateur: {
    code: 'administrateur',
    libelle: 'Administrateur',
    description: 'Acces total : donnees, comptes, sauvegardes, reseau, reglages et toutes les operations.',
    permissions: TOUTES_PERMISSIONS,
  },
  gerant: {
    code: 'gerant',
    libelle: 'Gerant',
    description: 'Pilote la boutique au quotidien : ventes, achats, stock, clients, fournisseurs, rapports et exports, sans comptes ni base systeme.',
    permissions: [
      PERMISSIONS.DASHBOARD_LIRE,
      PERMISSIONS.VENTE_ENCAISSER,
      PERMISSIONS.VENTE_LIRE,
      PERMISSIONS.VENTE_ANNULER,
      PERMISSIONS.VENTE_RETOUR,
      PERMISSIONS.CAISSE_GERER,
      PERMISSIONS.CAISSE_JOURNAL,
      PERMISSIONS.ARTICLES_LIRE,
      PERMISSIONS.ARTICLES_GERER,
      PERMISSIONS.STOCK_LIRE,
      PERMISSIONS.STOCK_MOUVEMENT,
      PERMISSIONS.CLIENTS_LIRE,
      PERMISSIONS.CLIENTS_GERER,
      PERMISSIONS.CLIENTS_REGLER,
      PERMISSIONS.FOURNISSEURS_LIRE,
      PERMISSIONS.FOURNISSEURS_GERER,
      PERMISSIONS.FOURNISSEURS_REGLER,
      PERMISSIONS.ACHATS_LIRE,
      PERMISSIONS.ACHATS_GERER,
      PERMISSIONS.RAPPORTS_BENEFICES,
      PERMISSIONS.RAPPORTS_EXPORTS,
      PERMISSIONS.AUDIT_LIRE,
    ],
  },
  caissier: {
    code: 'caissier',
    libelle: 'Caissier',
    description: 'Poste de caisse : vendre, ouvrir/fermer sa caisse, consulter le journal, creer/suivre les clients et encaisser les reglements clients.',
    permissions: [
      PERMISSIONS.DASHBOARD_LIRE,
      PERMISSIONS.VENTE_ENCAISSER,
      PERMISSIONS.VENTE_LIRE,
      PERMISSIONS.CAISSE_GERER,
      PERMISSIONS.CAISSE_JOURNAL,
      PERMISSIONS.ARTICLES_LIRE,
      PERMISSIONS.STOCK_LIRE,
      PERMISSIONS.CLIENTS_LIRE,
      PERMISSIONS.CLIENTS_GERER,
      PERMISSIONS.CLIENTS_REGLER,
    ],
  },
  stock: {
    code: 'stock',
    libelle: 'Stock / achats',
    description: 'Reception marchandise : articles, stock, fournisseurs, achats et retours fournisseur, sans encaissement client.',
    permissions: [
      PERMISSIONS.DASHBOARD_LIRE,
      PERMISSIONS.ARTICLES_LIRE,
      PERMISSIONS.ARTICLES_GERER,
      PERMISSIONS.STOCK_LIRE,
      PERMISSIONS.STOCK_MOUVEMENT,
      PERMISSIONS.FOURNISSEURS_LIRE,
      PERMISSIONS.FOURNISSEURS_GERER,
      PERMISSIONS.ACHATS_LIRE,
      PERMISSIONS.ACHATS_GERER,
    ],
  },
  comptable: {
    code: 'comptable',
    libelle: 'Comptable',
    description: 'Suivi financier : journal, creances, dettes, reglements, benefices et exports, sans modifier le stock ni vendre.',
    permissions: [
      PERMISSIONS.DASHBOARD_LIRE,
      PERMISSIONS.VENTE_LIRE,
      PERMISSIONS.CAISSE_JOURNAL,
      PERMISSIONS.ARTICLES_LIRE,
      PERMISSIONS.STOCK_LIRE,
      PERMISSIONS.CLIENTS_LIRE,
      PERMISSIONS.CLIENTS_GERER,
      PERMISSIONS.CLIENTS_REGLER,
      PERMISSIONS.FOURNISSEURS_LIRE,
      PERMISSIONS.FOURNISSEURS_REGLER,
      PERMISSIONS.RAPPORTS_BENEFICES,
      PERMISSIONS.RAPPORTS_EXPORTS,
      PERMISSIONS.AUDIT_LIRE,
    ],
  },
});

const ORDRE_ROLES = Object.freeze(['administrateur', 'gerant', 'caissier', 'stock', 'comptable']);

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

function normaliserRole(role) {
  const r = String(role ?? '').trim().toLowerCase();
  if (!DEFINITIONS_ROLES[r]) throw new RangeError('Role inconnu.');
  return r;
}

function roleStocke(role) {
  return role === 'administrateur' ? 'administrateur' : 'caissier';
}

function permissionsDuRole(role) {
  return [...DEFINITIONS_ROLES[normaliserRole(role)].permissions];
}

function libelleRole(role) {
  return DEFINITIONS_ROLES[normaliserRole(role)].libelle;
}

function decorerUtilisateur(ligne) {
  if (!ligne) return null;
  const role = normaliserRole(ligne.profil ?? ligne.role);
  return {
    id: ligne.id,
    identifiant: ligne.identifiant,
    nom: ligne.nom,
    role,
    roleLibelle: libelleRole(role),
    permissions: permissionsDuRole(role),
    actif: ligne.actif === undefined ? undefined : Boolean(ligne.actif),
  };
}

function rolesDisponibles() {
  return ORDRE_ROLES.map((code) => ({
    code,
    libelle: DEFINITIONS_ROLES[code].libelle,
    description: DEFINITIONS_ROLES[code].description,
    permissions: permissionsDuRole(code),
  }));
}

function aPermission(utilisateur, permission) {
  if (!utilisateur || !permission) return false;
  const role = normaliserRole(utilisateur.role ?? utilisateur.profil);
  return DEFINITIONS_ROLES[role].permissions.includes(permission);
}

function exigerPermission(utilisateur, permission) {
  if (!aPermission(utilisateur, permission)) {
    throw new Error('Permission refusee : ' + permission + '.');
  }
}

function aucunCompte(base) {
  return base.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get().n === 0;
}

function creer(base, { identifiant, nom, role, motDePasse }) {
  const id = String(identifiant ?? '').trim().toLowerCase();
  const profil = normaliserRole(role);
  if (id.length < 3) throw new RangeError("L'identifiant doit faire au moins 3 caracteres.");
  if (!nom || !String(nom).trim()) throw new RangeError('Le nom est obligatoire.');
  if (typeof motDePasse !== 'string' || motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new RangeError('Le mot de passe doit faire au moins ' + LONGUEUR_MIN_MOT_DE_PASSE + ' caracteres.');
  }
  const sel = crypto.randomBytes(16).toString('hex');
  try {
    const r = base
      .prepare(
        'INSERT INTO utilisateurs (identifiant, nom, role, profil, empreinte, sel, cree_le) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        String(nom).trim(),
        roleStocke(profil),
        profil,
        empreinter(motDePasse, sel),
        sel,
        new Date().toISOString()
      );
    return decorerUtilisateur({ id: r.lastInsertRowid, identifiant: id, nom: String(nom).trim(), role: roleStocke(profil), profil });
  } catch (erreur) {
    if (String(erreur.message).includes('UNIQUE')) {
      throw new RangeError('Cet identifiant est deja pris.');
    }
    throw erreur;
  }
}

function authentifier(base, identifiant, motDePasse) {
  const ligne = base
    .prepare('SELECT id, identifiant, nom, role, profil, empreinte, sel FROM utilisateurs WHERE identifiant = ? AND actif = 1')
    .get(String(identifiant ?? '').trim().toLowerCase());
  if (!ligne) return null;
  if (!comparer(ligne.empreinte, empreinter(motDePasse ?? '', ligne.sel))) return null;
  return decorerUtilisateur(ligne);
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
    .prepare('SELECT id, identifiant, nom, role, profil, actif FROM utilisateurs ORDER BY nom')
    .all()
    .map(decorerUtilisateur);
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
  PERMISSIONS,
  TOUTES_PERMISSIONS,
  DEFINITIONS_ROLES,
  aucunCompte,
  accesStandardExiste,
  assurerAccesStandard,
  creer,
  authentifier,
  lister,
  changerMotDePasse,
  activer,
  rolesDisponibles,
  permissionsDuRole,
  aPermission,
  exigerPermission,
};

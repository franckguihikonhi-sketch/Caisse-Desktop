'use strict';

const GUIDE_UTILISATEUR = [
  {
    id: 'premier-demarrage',
    titre: 'Premier demarrage',
    resume: 'Ouvrir Ivoire-Gestion avec le compte standard, renseigner la boutique et creer les vrais utilisateurs.',
    motsCles: ['connexion', 'CIV', 'mot de passe', 'boutique', 'utilisateurs'],
    etapes: [
      'Connectez-vous avec l identifiant CIV et le mot de passe CIV lors de la premiere installation.',
      'Ouvrez Reglages, renseignez le nom, l adresse et le telephone de la boutique.',
      'Changez le mot de passe CIV, puis creez un compte pour chaque personne qui utilisera la caisse.',
      'Attribuez le bon role : administrateur, gerant, caissier, stock/achats ou comptable.',
    ],
    vigilance: [
      'Le compte CIV est seulement l acces de depart : chaque entreprise doit ensuite choisir son propre mot de passe.',
      'Ne partagez pas un compte entre plusieurs personnes si vous voulez un audit precis.',
    ],
    actions: [{ libelle: 'Ouvrir Reglages', vue: 'reglages', permissionAny: ['parametres:gerer', 'utilisateurs:gerer'] }],
  },
  {
    id: 'vente-caisse',
    titre: 'Vendre comme en caisse supermarket',
    resume: 'Ouvrir la caisse, scanner ou rechercher les articles, choisir piece/carton et encaisser sans stock negatif.',
    motsCles: ['vente', 'ticket', 'scanner', 'piece', 'carton', 'stock', 'caisse'],
    etapes: [
      'Ouvrez la caisse du jour depuis l ecran Caisse si elle est fermee.',
      'Dans Vente, scannez un code-barres ou tapez une reference/designation.',
      'Choisissez l unite piece ou carton ; pour un article mixte, ajoutez une ligne carton et une ligne piece.',
      'Verifiez le panier, le client si vente a credit, puis validez le paiement.',
      'Imprimez le ticket ou sortez la facture PDF selon le besoin du client.',
    ],
    vigilance: [
      'Ivoire-Gestion relit les prix et le stock dans la base au moment de valider : aucun stock inexistant ne peut etre vendu.',
      'Une vente est refusee si la caisse journaliere est fermee.',
    ],
    actions: [
      { libelle: 'Aller a Vente', vue: 'vente', permission: 'vente:encaisser' },
      { libelle: 'Ouvrir Caisse', vue: 'journal', permission: 'caisse:journal' },
    ],
  },
  {
    id: 'articles-achats-stock',
    titre: 'Articles, achats et stock parfait',
    resume: 'Creer les articles, receptionner les achats fournisseur et garder le stock coherent en pieces et cartons.',
    motsCles: ['articles', 'achats', 'fournisseurs', 'stock', 'inventaire', 'carton'],
    etapes: [
      'Creez d abord les articles avec reference, prix d achat, prix de vente, pieces par carton et seuil d alerte.',
      'Dans Achats, saisissez chaque facture fournisseur avec les lignes en pieces ou cartons.',
      'Le stock augmente automatiquement et la dette fournisseur est creee si l achat est a credit.',
      'Consultez Stock pour voir le restant par article et lancer un inventaire physique si necessaire.',
      'Pour une correction manuelle, indiquez toujours un motif clair : casse, comptage, erreur de reception.',
    ],
    vigilance: [
      'Le stock interne est toujours tenu en pieces, meme si l achat ou la vente est en carton.',
      'Les corrections et inventaires sont historises pour retrouver qui a modifie le stock et pourquoi.',
    ],
    actions: [
      { libelle: 'Articles', vue: 'articles', permission: 'articles:lire' },
      { libelle: 'Achats', vue: 'achats', permission: 'achats:lire' },
      { libelle: 'Stock', vue: 'stock', permission: 'stock:lire' },
    ],
  },
  {
    id: 'credits-clients-fournisseurs',
    titre: 'Credits clients et dettes fournisseurs',
    resume: 'Suivre les creances clients, les plafonds de credit, les reglements et les dettes fournisseur.',
    motsCles: ['client', 'credit', 'creance', 'fournisseur', 'dette', 'reglement'],
    etapes: [
      'Creez une fiche client avant de vendre a credit et fixez son plafond autorise.',
      'Les ventes a credit alimentent automatiquement les creances ouvertes du client.',
      'Enregistrez les reglements clients depuis Clients & credits pour reduire les soldes.',
      'Les achats fournisseur a credit alimentent automatiquement les dettes fournisseur.',
      'Reglez les fournisseurs depuis l onglet Fournisseurs afin de garder les soldes justes.',
    ],
    vigilance: [
      'Une vente a credit est refusee si le plafond client est depasse.',
      'Les tickets de credit affichent les factures ouvertes du debiteur pour faciliter le suivi.',
    ],
    actions: [
      { libelle: 'Clients', vue: 'clients', permission: 'clients:lire' },
      { libelle: 'Fournisseurs', vue: 'fournisseurs', permission: 'fournisseurs:lire' },
    ],
  },
  {
    id: 'tableau-benefices',
    titre: 'Piloter le benefice proprietaire',
    resume: 'Lire le tableau de bord, les marges du jour/mois, la valeur du stock et le benefice par facture d achat.',
    motsCles: ['dashboard', 'tableau de bord', 'benefice', 'marge', 'profit', 'rentabilite'],
    etapes: [
      'Consultez le Tableau de bord pour voir ventes du jour, ventes du mois, benefice et encaisse.',
      'Surveillez le net credits : creances clients moins dettes fournisseurs.',
      'Controlez la valeur du stock au prix d achat, au prix de vente et la marge potentielle en rayon.',
      'Ouvrez Benefices pour choisir une facture d achat et voir le profit obtenu seulement sur les articles deja vendus.',
    ],
    vigilance: [
      'La marge utilise le prix d achat enregistre au moment de la vente pour garder un resultat coherent.',
      'Un article achete mais pas encore vendu ne cree pas de benefice dans le rapport par facture.',
    ],
    actions: [
      { libelle: 'Tableau de bord', vue: 'tableauBord', permission: 'dashboard:lire' },
      { libelle: 'Benefices', vue: 'benefices', permission: 'rapports:benefices' },
    ],
  },
  {
    id: 'securite-audit',
    titre: 'Securite, audit et actions critiques',
    resume: 'Comprendre les permissions, les motifs obligatoires et l historique complet des operations sensibles.',
    motsCles: ['audit', 'historique', 'roles', 'permissions', 'annulation', 'motif', 'securite'],
    etapes: [
      'Attribuez a chaque utilisateur uniquement le role dont il a besoin.',
      'Les annulations, retours, restaurations et corrections de stock demandent un motif obligatoire.',
      'Ouvrez Audit pour filtrer par action, utilisateur, periode ou mot-cle.',
      'Verifiez regulierement les annulations, changements de stock, sauvegardes/restaurations et connexions refusees.',
    ],
    vigilance: [
      'Masquer un bouton ne suffit pas : le processus principal refuse aussi toute action sans permission.',
      'Un motif court mais clair protege le proprietaire en cas de controle ou de litige.',
    ],
    actions: [{ libelle: 'Audit', vue: 'audit', permission: 'audit:lire' }],
  },
  {
    id: 'sauvegarde-reseau',
    titre: 'Sauvegarde, restauration et reseau local',
    resume: 'Sauvegarder la base, restaurer prudemment et utiliser un dossier partage pour plusieurs postes sans Internet.',
    motsCles: ['sauvegarde', 'restauration', 'reseau', 'partage', 'base', 'sqlite'],
    etapes: [
      'Dans Reglages, utilisez Sauvegarder la base avant une mise a jour ou un changement de poste.',
      'Pour restaurer, choisissez une sauvegarde et renseignez le motif obligatoire de restauration.',
      'Pour plusieurs postes dans la meme boutique, placez caisse.db dans un dossier partage Windows ou NAS.',
      'Utilisez Tester acces reseau pour verifier l ecriture, la lecture et l integrite SQLite du dossier partage.',
      'Si chaque entreprise est independante, gardez la base locale par defaut sur chaque poste.',
    ],
    vigilance: [
      'Le mode reseau local ne demande pas Internet mais exige que tous les postes voient le meme partage.',
      'Si le poste qui partage la base est eteint, les autres postes ne peuvent pas acceder a cette base partagee.',
    ],
    actions: [{ libelle: 'Reglages base', vue: 'reglages', permission: 'base:gerer' }],
  },
];

function texteSection(section) {
  return [
    section.titre,
    section.resume,
    ...(section.motsCles || []),
    ...(section.etapes || []),
    ...(section.vigilance || []),
  ].join(' ').toLowerCase();
}

function rechercherGuide(sections = GUIDE_UTILISATEUR, recherche = '') {
  const termes = String(recherche ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (termes.length === 0) return sections;
  return sections.filter((section) => {
    const texte = texteSection(section);
    return termes.every((terme) => texte.includes(terme));
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GUIDE_UTILISATEUR, rechercherGuide };
}

if (typeof globalThis !== 'undefined') {
  globalThis.GUIDE_UTILISATEUR = GUIDE_UTILISATEUR;
  globalThis.rechercherGuideUtilisateur = rechercherGuide;
}

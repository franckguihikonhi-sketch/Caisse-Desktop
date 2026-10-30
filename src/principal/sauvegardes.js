'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXTENSIONS_BASE = new Set(['.db', '.sqlite', '.sqlite3']);
const PREFIXE_AUTO = 'ivoire-gestion-auto-';
const PREFIXE_AVANT_RESTAURATION = 'ivoire-gestion-avant-restauration-';
const RETENTION_AUTO_DEFAUT = 30;

function deux(n) {
  return String(n).padStart(2, '0');
}

function estampille(date = new Date()) {
  return String(date.getFullYear()) + deux(date.getMonth() + 1) + deux(date.getDate()) +
    '-' + deux(date.getHours()) + deux(date.getMinutes()) + deux(date.getSeconds());
}

function cleJour(date = new Date()) {
  return String(date.getFullYear()) + deux(date.getMonth() + 1) + deux(date.getDate());
}

function verifierFichierBase(chemin) {
  if (!chemin || !fs.existsSync(chemin)) throw new Error('Fichier de base introuvable.');
  const stat = fs.statSync(chemin);
  if (!stat.isFile()) throw new Error('Le chemin choisi n est pas un fichier.');
  const ext = path.extname(chemin).toLowerCase();
  if (!EXTENSIONS_BASE.has(ext)) throw new Error('Choisissez un fichier de sauvegarde .db, .sqlite ou .sqlite3.');
}

function supprimerJournaux(cheminBase) {
  for (const suffixe of ['-wal', '-shm', '-journal']) {
    const chemin = cheminBase + suffixe;
    if (fs.existsSync(chemin)) fs.rmSync(chemin, { force: true });
  }
}

function creerCopie(source, cible, { consolider = null } = {}) {
  verifierFichierBase(source);
  if (consolider) consolider();
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.copyFileSync(source, cible);
  const stat = fs.statSync(cible);
  return { chemin: cible, date: stat.mtime.toISOString(), taille: stat.size };
}

function lister(dossier) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier)
    .filter((nom) => EXTENSIONS_BASE.has(path.extname(nom).toLowerCase()))
    .map((nom) => {
      const chemin = path.join(dossier, nom);
      const stat = fs.statSync(chemin);
      return { nom, chemin, date: stat.mtime.toISOString(), taille: stat.size };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.nom.localeCompare(a.nom));
}

function nettoyerAnciennes(dossier, maximum = RETENTION_AUTO_DEFAUT) {
  const sauvegardes = lister(dossier)
    .filter((s) => s.nom.startsWith(PREFIXE_AUTO))
    .sort((a, b) => b.nom.localeCompare(a.nom));
  const supprimees = [];
  for (const sauvegarde of sauvegardes.slice(maximum)) {
    fs.rmSync(sauvegarde.chemin, { force: true });
    supprimees.push(sauvegarde.chemin);
  }
  return supprimees;
}

function sauvegarderAutomatiquement({ source, dossier, maintenant = new Date(), consolider = null, retention = RETENTION_AUTO_DEFAUT }) {
  verifierFichierBase(source);
  const jour = cleJour(maintenant);
  fs.mkdirSync(dossier, { recursive: true });
  const existante = lister(dossier).find((s) => s.nom.startsWith(PREFIXE_AUTO + jour));
  if (existante) {
    return { cree: false, sauvegarde: existante, supprimees: nettoyerAnciennes(dossier, retention) };
  }
  const cible = path.join(dossier, PREFIXE_AUTO + estampille(maintenant) + '.db');
  const sauvegarde = creerCopie(source, cible, { consolider });
  return { cree: true, sauvegarde, supprimees: nettoyerAnciennes(dossier, retention) };
}

function restaurerDepuis({ source, cible, dossierSecours, maintenant = new Date(), avantCopie = null, fermerAvantRemplacement = null }) {
  verifierFichierBase(source);
  if (!cible) throw new Error('Base active introuvable.');
  fs.mkdirSync(dossierSecours, { recursive: true });
  const sauvegardeAvantRestauration = fs.existsSync(cible)
    ? creerCopie(cible, path.join(dossierSecours, PREFIXE_AVANT_RESTAURATION + estampille(maintenant) + '.db'), {
        consolider: avantCopie,
      })
    : null;

  if (fermerAvantRemplacement) fermerAvantRemplacement();
  supprimerJournaux(cible);
  fs.copyFileSync(source, cible);
  supprimerJournaux(cible);
  return { restauree: cible, sauvegardeAvantRestauration };
}

module.exports = {
  PREFIXE_AUTO,
  PREFIXE_AVANT_RESTAURATION,
  RETENTION_AUTO_DEFAUT,
  estampille,
  cleJour,
  creerCopie,
  lister,
  nettoyerAnciennes,
  sauvegarderAutomatiquement,
  restaurerDepuis,
  supprimerJournaux,
};

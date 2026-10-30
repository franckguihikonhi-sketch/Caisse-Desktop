'use strict';

const fs = require('node:fs');
const path = require('node:path');

const articles = require('../donnees/articles');
const ventes = require('../donnees/ventes');
const stocks = require('../donnees/stocks');
const clients = require('../donnees/clients');
const fournisseurs = require('../donnees/fournisseurs');
const benefices = require('../donnees/benefices');

function cellule(valeur) {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  const texte = String(valeur).replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return /[;"\n\r]/.test(texte) ? '"' + texte + '"' : texte;
}

function ecrireCsv(chemin, colonnes, lignes) {
  const contenu = [
    colonnes.map((c) => cellule(c.titre)).join(';'),
    ...lignes.map((ligne) => colonnes.map((c) => cellule(typeof c.valeur === 'function' ? c.valeur(ligne) : ligne[c.valeur])).join(';')),
  ].join('\r\n');
  // BOM UTF-8 : Excel Windows ouvre directement les accents correctement.
  fs.writeFileSync(chemin, '\ufeff' + contenu + '\r\n');
  return chemin;
}

function nomDossier(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function exporterCsv(base, dossierRacine, { jour = new Date().toISOString().slice(0, 10) } = {}) {
  const dossier = path.join(dossierRacine, 'export-' + nomDossier());
  fs.mkdirSync(dossier, { recursive: true });

  const fichiers = [];
  fichiers.push(ecrireCsv(path.join(dossier, 'articles-stock.csv'), [
    { titre: 'Reference', valeur: 'reference' },
    { titre: 'Designation', valeur: 'designation' },
    { titre: 'Stock pieces', valeur: 'stock' },
    { titre: 'Stock lisible', valeur: 'stockLibelle' },
    { titre: 'Conditionnement', valeur: 'conditionnement' },
    { titre: 'Pieces par carton', valeur: 'piecesParCarton' },
    { titre: 'Prix vente piece', valeur: 'prixUnitaire' },
    { titre: 'Prix vente carton', valeur: 'prixCarton' },
    { titre: 'Prix achat piece', valeur: 'prixAchatPiece' },
    { titre: 'Prix achat carton', valeur: 'prixAchatCarton' },
    { titre: 'Seuil alerte', valeur: 'seuilAlerte' },
    { titre: 'Actif', valeur: 'actif' },
  ], articles.lister(base, { inclureInactifs: true })));

  fichiers.push(ecrireCsv(path.join(dossier, 'ventes-du-jour.csv'), [
    { titre: 'Numero', valeur: 'numero' },
    { titre: 'Date', valeur: 'date' },
    { titre: 'Client', valeur: 'clientNom' },
    { titre: 'Caissier', valeur: 'caissier' },
    { titre: 'Mode paiement', valeur: 'modePaiement' },
    { titre: 'Total TTC', valeur: 'totalTtc' },
    { titre: 'Retours', valeur: 'totalRetours' },
    { titre: 'Montant net', valeur: 'montantNet' },
    { titre: 'Annulee', valeur: 'annulee' },
  ], ventes.journal(base, jour)));

  fichiers.push(ecrireCsv(path.join(dossier, 'mouvements-stock.csv'), [
    { titre: 'Date', valeur: 'date' },
    { titre: 'Type', valeur: 'type' },
    { titre: 'Reference article', valeur: 'articleReference' },
    { titre: 'Designation', valeur: 'articleDesignation' },
    { titre: 'Quantite stock', valeur: 'quantite' },
    { titre: 'Quantite lisible', valeur: 'quantiteLibelle' },
    { titre: 'Stock avant', valeur: 'stockAvantLibelle' },
    { titre: 'Stock apres', valeur: 'stockApresLibelle' },
    { titre: 'Motif', valeur: 'motif' },
    { titre: 'Reference document', valeur: 'reference' },
    { titre: 'Utilisateur', valeur: 'utilisateur' },
    { titre: 'Fournisseur', valeur: 'fournisseur' },
  ], stocks.lister(base, { limite: 500 })));

  fichiers.push(ecrireCsv(path.join(dossier, 'creances-clients.csv'), [
    { titre: 'Numero', valeur: 'numero' },
    { titre: 'Client', valeur: 'clientNom' },
    { titre: 'Code client', valeur: 'clientCode' },
    { titre: 'Date creation', valeur: 'dateCreation' },
    { titre: 'Echeance', valeur: 'dateEcheance' },
    { titre: 'Libelle', valeur: 'libelle' },
    { titre: 'Montant initial', valeur: 'montantInitial' },
    { titre: 'Solde', valeur: 'solde' },
    { titre: 'Statut', valeur: 'statut' },
    { titre: 'Note', valeur: 'note' },
  ], clients.listerCreances(base, { inclureReglees: true })));

  fichiers.push(ecrireCsv(path.join(dossier, 'dettes-fournisseurs.csv'), [
    { titre: 'Numero', valeur: 'numero' },
    { titre: 'Fournisseur', valeur: 'fournisseurNom' },
    { titre: 'Code fournisseur', valeur: 'fournisseurCode' },
    { titre: 'Date creation', valeur: 'dateCreation' },
    { titre: 'Echeance', valeur: 'dateEcheance' },
    { titre: 'Libelle', valeur: 'libelle' },
    { titre: 'Montant initial', valeur: 'montantInitial' },
    { titre: 'Solde', valeur: 'solde' },
    { titre: 'Statut', valeur: 'statut' },
    { titre: 'Note', valeur: 'note' },
  ], fournisseurs.listerDettes(base, { inclureReglees: true })));

  const rapportBenefices = benefices.lister(base);
  const lignesBenefices = rapportBenefices.factures.flatMap((facture) => facture.lignes.map((ligne) => ({
    ...ligne,
    factureNumero: facture.numero,
    factureDate: facture.dateAchat,
    factureFournisseur: facture.fournisseurNom,
    factureReference: facture.referenceDocument,
  })));
  fichiers.push(ecrireCsv(path.join(dossier, 'benefices-par-facture.csv'), [
    { titre: 'Facture achat', valeur: 'factureNumero' },
    { titre: 'Date achat', valeur: 'factureDate' },
    { titre: 'Fournisseur', valeur: 'factureFournisseur' },
    { titre: 'Reference document', valeur: 'factureReference' },
    { titre: 'Reference article', valeur: 'reference' },
    { titre: 'Designation', valeur: 'designation' },
    { titre: 'Quantite vendue', valeur: 'quantiteStockVendueLibelle' },
    { titre: 'Cout achat', valeur: 'coutAchat' },
    { titre: 'Chiffre affaires', valeur: 'chiffreAffaires' },
    { titre: 'Benefice', valeur: 'benefice' },
    { titre: 'Marge %', valeur: 'margePourcent' },
    { titre: 'Nombre ventes', valeur: 'nombreVentes' },
    { titre: 'Derniere vente', valeur: 'derniereVente' },
  ], lignesBenefices));

  const manifeste = path.join(dossier, 'README-export.txt');
  fs.writeFileSync(manifeste,
    'Export Ivoire-Gestion\r\n' +
    'Date: ' + new Date().toLocaleString('fr-FR') + '\r\n' +
    'Jour des ventes exportees: ' + jour + '\r\n\r\n' +
    'Fichiers CSV compatibles Excel: articles-stock, ventes-du-jour, mouvements-stock, creances-clients, dettes-fournisseurs, benefices-par-facture.\r\n'
  );
  fichiers.push(manifeste);

  return { dossier, fichiers, nombreFichiers: fichiers.length };
}

module.exports = { exporterCsv };

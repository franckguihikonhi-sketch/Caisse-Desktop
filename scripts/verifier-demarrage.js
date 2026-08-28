'use strict';

/*
 * Verification de demarrage. Lance l'application sur une base jetable, s'y
 * connecte comme le ferait un caissier, remplit un panier, encaisse, et rend
 * compte de la moindre erreur de console. C'est ce qui distingue "le code est
 * ecrit" de "l'application marche".
 *
 *   npm run verifier
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

// Sous affichage virtuel (integration continue, conteneur), la composition
// materielle n'existe pas : sans cela capturePage echoue en UnknownVizError.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-verification-'));
app.setPath('userData', dossier);

const { ouvrir } = require('../src/donnees/base');
const utilisateurs = require('../src/donnees/utilisateurs');
const articles = require('../src/donnees/articles');
const { enregistrerCanaux } = require('../src/principal/canaux');
const impression = require('../src/principal/impression');

const problemes = [];
const etapes = [];
const session = { utilisateur: null };

function noter(etape, detail = '') {
  etapes.push('  ok   ' + etape + (detail ? '  -> ' + detail : ''));
}

/** Une capture ratee ne condamne pas la verification : elle depend de l'affichage. */
async function capturer(fenetre, nom) {
  const chemin = path.join(__dirname, '..', nom);
  try {
    fs.writeFileSync(chemin, (await fenetre.webContents.capturePage()).toPNG());
    noter('capture enregistree', chemin);
  } catch (erreur) {
    etapes.push('  --   capture ' + nom + ' indisponible (' + erreur.message + ')');
  }
}

async function verifier() {
  const bd = ouvrir(path.join(dossier, 'caisse.db'));
  utilisateurs.creer(bd, {
    identifiant: 'demo', nom: 'Awa Kone', role: 'administrateur', motDePasse: 'demo1234',
  });
  articles.creer(bd, { reference: 'sav-01', designation: 'Savon de Marseille', prixUnitaire: 325, stock: 120, seuilAlerte: 20 });
  articles.creer(bd, { reference: 'riz-05', designation: 'Riz parfume 5 kg', prixUnitaire: 4500, stock: 18, seuilAlerte: 20 });
  articles.creer(bd, { reference: 'pain', designation: 'Pain', prixUnitaire: 200, tauxTva: 0, stock: 60 });
  articles.creer(bd, {
    reference: 'nut-400', designation: 'Pate a tartiner 400 g', prixUnitaire: 3500,
    stock: 12, seuilAlerte: 4, codeBarres: '3017620422003',
  });
  enregistrerCanaux(bd, session);
  noter('base ouverte et catalogue seme', '4 articles, dont un a code-barres');

  const fenetre = new BrowserWindow({
    // Fenetre visible : une fenetre masquee ne repeint pas, et capturePage
    // rendrait alors une image perimee.
    width: 1280, height: 800, show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'principal', 'passerelle.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });

  fenetre.webContents.on('console-message', (_e, niveau, message, ligne, source) => {
    if (niveau >= 2) problemes.push('console : ' + message + '  (' + source + ':' + ligne + ')');
  });
  fenetre.webContents.on('preload-error', (_e, chemin, erreur) => {
    problemes.push('preload : ' + chemin + ' -> ' + erreur.message);
  });
  fenetre.webContents.on('render-process-gone', (_e, details) => {
    problemes.push('processus de rendu perdu : ' + details.reason);
  });

  await fenetre.loadFile(path.join(__dirname, '..', 'src', 'rendu', 'index.html'));
  noter('index.html charge');

  const executer = (code) => fenetre.webContents.executeJavaScript(code, true);
  const patienter = (ms) => new Promise((r) => setTimeout(r, ms));
  await patienter(400);

  if (!(await executer('typeof window.caisse === "object"'))) {
    problemes.push("le pont window.caisse n'est pas expose au rendu");
  } else {
    noter('pont window.caisse expose');
  }

  const ecranVisible = () =>
    executer('[...document.querySelectorAll(".ecran")].find((e) => e.classList.contains("actif"))?.id');

  if ((await ecranVisible()) !== 'ecran-connexion') {
    problemes.push("l'ecran de connexion ne s'affiche pas au demarrage");
  } else {
    noter('ecran de connexion affiche');
  }

  await executer(`
    document.querySelector('#formulaire-connexion [name=identifiant]').value = 'demo';
    document.querySelector('#formulaire-connexion [name=motDePasse]').value = 'demo1234';
    document.querySelector('#formulaire-connexion').requestSubmit();
  `);
  await patienter(600);

  if ((await ecranVisible()) !== 'ecran-application') {
    problemes.push("la connexion n'ouvre pas la caisse");
  } else {
    noter('connexion aboutie', await executer('document.querySelector("#nom-utilisateur").textContent'));
  }

  const nombreArticles = await executer('document.querySelectorAll("#resultats-articles .article").length');
  if (nombreArticles !== 4) {
    problemes.push('le catalogue affiche ' + nombreArticles + ' articles au lieu de 4');
  } else {
    noter('catalogue affiche', nombreArticles + ' articles');
  }

  // Une douchette tape ses chiffres en quelques millisecondes puis appuie sur
  // Entree. On rejoue exactement cela, touches synthetiques comprises, pour
  // verifier que la lecture est reconnue et que l'article part au panier.
  await executer(`
    (async () => {
      const frapper = (touche) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: touche, bubbles: true, cancelable: true })
      );
      for (const chiffre of '3017620422003') { frapper(chiffre); }
      frapper('Enter');
    })();
  `);
  await patienter(500);

  const auPanier = await executer(
    'document.querySelectorAll("#lignes-panier .ligne-panier .designation").length'
  );
  const annonce = await executer('document.querySelector("#annonce").textContent');
  if (auPanier !== 1) {
    problemes.push('la lecture du code-barres n a pas rempli le panier (' + auPanier + ' ligne(s))');
  } else {
    noter('code-barres lu et article ajoute', annonce.trim());
  }

  // Une saisie humaine, lente, ne doit surtout pas passer pour une lecture.
  await executer('Vente.reinitialiser(); document.querySelector("#champ-recherche").value = "";');
  await executer(`
    (async () => {
      const frapper = (touche) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: touche, bubbles: true, cancelable: true })
      );
      for (const chiffre of '3017620422003') {
        frapper(chiffre);
        await new Promise((r) => setTimeout(r, 60));
      }
      frapper('Enter');
    })();
  `);
  await patienter(1400);

  const apresSaisieLente = await executer(
    'document.querySelectorAll("#lignes-panier .ligne-panier .designation").length'
  );
  if (apresSaisieLente !== 0) {
    problemes.push('une frappe humaine lente a ete prise pour une lecture de douchette');
  } else {
    noter('frappe humaine lente ignoree par la douchette');
  }

  await executer(`
    Vente.reinitialiser();
    Vente.ajouter({ reference: 'SAV-01', designation: 'Savon de Marseille', prixUnitaire: 325, tauxTva: 18, stock: 120, seuilAlerte: 20 });
    Vente.ajouter({ reference: 'SAV-01', designation: 'Savon de Marseille', prixUnitaire: 325, tauxTva: 18, stock: 120, seuilAlerte: 20 });
    Vente.ajouter({ reference: 'PAIN', designation: 'Pain', prixUnitaire: 200, tauxTva: 0, stock: 60, seuilAlerte: 0 });
    document.querySelector('#montant-recu').value = '2000';
    document.querySelector('#montant-recu').dispatchEvent(new Event('input'));
  `);
  await patienter(200);

  const total = await executer('document.querySelector("#total-ttc").textContent');
  const rendu = await executer('document.querySelector("#monnaie-rendue").textContent');
  // 2 savons a 325 F + 1 pain a 200 F = 850 F ; sur 2 000 F recus, 1 150 F rendus.
  if (total.replace(/\s/g, '') !== '850F') {
    problemes.push('total affiche « ' + total + ' » au lieu de 850 F');
  } else {
    noter('total du panier', total);
  }
  if (rendu.replace(/\s/g, '') !== '1150F') {
    problemes.push('monnaie affichee « ' + rendu + ' » au lieu de 1 150 F');
  } else {
    noter('monnaie a rendre', rendu);
  }

  await capturer(fenetre, 'verification-caisse.png');

  await executer('document.querySelector("#bouton-encaisser").click()');
  await patienter(900);

  const ticket = await executer('document.querySelector("#boite pre.ticket")?.textContent ?? ""');
  if (!ticket.includes('TOTAL')) {
    problemes.push("l'encaissement n'affiche pas le ticket");
  } else {
    noter('vente encaissee et ticket affiche');
  }

  await capturer(fenetre, 'verification-ticket.png');

  const stock = articles.lireParReference(bd, 'SAV-01').stock;
  if (stock !== 118) problemes.push('stock a ' + stock + ' au lieu de 118 apres la vente');
  else noter('stock decompte', '120 -> 118');

  // --- Etiquettes ----------------------------------------------------------
  // On ferme le ticket, puis on ouvre la boite d'etiquettes depuis le
  // catalogue, comme le ferait la personne qui recoit une livraison.
  await executer('document.querySelector("#voile .actions .bouton:last-child").click()');
  await patienter(300);
  await executer('document.querySelector(".navigation button[data-vue=articles]").click()');
  await patienter(600);

  const cochables = await executer(
    'document.querySelectorAll("#corps-articles td.choix input:not(:disabled)").length'
  );
  if (cochables !== 1) {
    problemes.push(
      cochables + ' article(s) cochable(s) au lieu de 1 : seul celui a code-barres doit l etre'
    );
  } else {
    noter('seul l article a code-barres est cochable');
  }

  await executer(`
    const case_ = document.querySelector('#corps-articles td.choix input:not(:disabled)');
    case_.checked = true;
    case_.dispatchEvent(new Event('change'));
    document.querySelector('#actions-vue .bouton').click();
  `);
  await patienter(600);

  const apercu = await executer('document.querySelectorAll("#boite .apercu-etiquette svg rect").length');
  if (apercu < 10) {
    problemes.push("l apercu de l etiquette ne dessine pas de code-barres (" + apercu + ' rectangles)');
  } else {
    noter('apercu de l etiquette dessine', apercu + ' barres');
  }
  await capturer(fenetre, 'verification-etiquettes.png');
  await executer('document.querySelector("#boite .actions .bouton").click()');
  await patienter(300);

  // Le parcours de la boutique qui etiquette elle-meme : ouvrir une fiche
  // vierge, demander un code interne, verifier qu'il est imprimable.
  // Le point-virgule et le null final sont indispensables : executeJavaScript
  // attend la promesse qu'on lui rend, et celle d'une boite modale ne se
  // resout qu'a sa fermeture — la verification resterait suspendue.
  await executer('Articles.editer(null); null;');
  await patienter(400);
  await executer('document.querySelector("#boite .menu-code").click()');
  await patienter(500);

  const codeAttribue = await executer(
    'document.querySelector("#boite input[name=codeBarres]").value'
  );
  const verdictAffiche = await executer('document.querySelector("#boite .verdict").textContent');

  if (!/^2\d{12}$/.test(codeAttribue)) {
    problemes.push('code interne attribue inattendu : « ' + codeAttribue + ' »');
  } else if (!verdictAffiche.includes('usage interne')) {
    problemes.push('le code attribue n est pas annonce comme reserve : « ' + verdictAffiche + ' »');
  } else {
    noter('code interne attribue depuis la fiche', codeAttribue);
  }

  const dessinable = await executer(
    'window.caisse.calcul.codeBarresDessinable(' + JSON.stringify(codeAttribue) + ')'
  );
  if (!dessinable) problemes.push('le code interne attribue ne se dessine pas');
  else noter('le code interne attribue est imprimable');

  await executer('document.querySelector("#boite .actions .bouton").click()');
  await patienter(300);

  // La planche elle-meme : on produit le PDF et on verifie qu'il en est un.
  const dossierEtiquettes = path.join(dossier, 'etiquettes');
  const planche = await impression.exporterEtiquettesPdf({
    articles: [
      { designation: 'Pate a tartiner 400 g', prixUnitaire: 3500, codeBarres: '3017620422003', quantite: 12 },
      { designation: 'Savon de Marseille', prixUnitaire: 325, codeBarres: null, quantite: 4 },
      { designation: 'Beignets du matin', prixUnitaire: 100, codeBarres: codeAttribue, quantite: 6 },
    ],
    boutique: { nom: 'Ma boutique' },
    format: 'a4-65',
    avecPrix: true,
  }, dossierEtiquettes);

  const pdf = fs.readFileSync(planche.chemin);
  if (pdf.subarray(0, 5).toString() !== '%PDF-' || pdf.length < 5000) {
    problemes.push('la planche d etiquettes ne produit pas un PDF exploitable');
  } else {
    noter(
      'planche d etiquettes produite',
      planche.nombreEtiquettes + ' etiquettes dont 6 a code interne, ' +
        planche.nombrePages + ' page(s), ' +
        Math.round(pdf.length / 1024) + ' Ko'
    );
  }
  if (planche.ecartes.length !== 1 || planche.ecartes[0].motif !== 'pas de code-barres') {
    problemes.push('l article sans code-barres aurait du etre ecarte et signale');
  } else {
    noter('article sans code-barres ecarte', planche.ecartes[0].designation);
  }

  fenetre.destroy();
  bd.close();
  return ticket;
}

app.whenReady().then(async () => {
  let ticket = '';
  try {
    ticket = await verifier();
  } catch (erreur) {
    problemes.push('exception : ' + erreur.stack);
  }

  console.log('\n' + etapes.join('\n'));
  if (ticket) console.log('\nTicket emis :\n' + ticket.split('\n').map((l) => '  | ' + l).join('\n'));

  if (problemes.length > 0) {
    console.log('\nPROBLEMES :\n' + problemes.map((p) => '  - ' + p).join('\n') + '\n');
    app.exit(1);
  } else {
    console.log('\nDemarrage verifie : la caisse se lance, encaisse, imprime et etiquette.\n');
    app.exit(0);
  }
});

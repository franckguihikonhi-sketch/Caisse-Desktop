'use strict';

/* Ecran de vente. Le panier vit ici, en memoire ; les totaux affiches viennent
   du meme calcul que celui du processus principal, mais l'enregistrement, lui,
   recalcule tout a partir de la base : l'ecran ne fait jamais foi. */

const Vente = {
  panier: [],
  mode: 'especes',
  clientCredit: null,
  caisseOuverte: false,
  articlesTrouves: [],
  totaux: null,

  initialiser() {
    $('#champ-recherche').addEventListener('input', (e) => this.rechercher(e.target.value));
    $('#champ-recherche').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.articlesTrouves.length > 0) {
        e.preventDefault();
        this.ajouter(this.articlesTrouves[0]);
      }
    });

    $('#remise-globale').addEventListener('input', () => this.rafraichirTotaux());
    $('#montant-recu').addEventListener('input', () => this.rafraichirRendu());
    $('#bouton-choisir-client').addEventListener('click', () => this.choisirClientCredit());
    $('#bouton-encaisser').addEventListener('click', () => this.encaisser());

    for (const bouton of $$('#modes-paiement button')) {
      bouton.addEventListener('click', () => this.choisirMode(bouton.dataset.mode));
    }

    Douchette.ecouter(
      (code) => this.surCodeLu(code),
      () => $('#vue-vente').classList.contains('actif') &&
        !$('#voile').classList.contains('visible')
    );

    document.addEventListener('keydown', (evenement) => {
      const enVente = $('#vue-vente').classList.contains('actif');
      if (!enVente || $('#voile').classList.contains('visible')) return;
      if (evenement.key === 'F2') {
        evenement.preventDefault();
        this.encaisser();
      }
      if (evenement.key === 'F3') {
        evenement.preventDefault();
        $('#champ-recherche').focus();
        $('#champ-recherche').select();
      }
    });
  },

  async activer() {
    const actions = $('#actions-vue');
    vider(actions);
    await this.actualiserCaisse();
    actions.append(creer('button', {
      classe: this.caisseOuverte ? 'bouton discret' : 'bouton',
      texte: this.caisseOuverte ? 'Caisse ouverte' : 'Ouvrir la caisse',
      sur: { click: () => this.ouvrirCaisseRapide() },
    }));
    $('#champ-recherche').focus();
    await this.rechercher('');
  },

  async actualiserCaisse() {
    try {
      const etat = await appeler(window.caisse.caisseJournee.etat());
      this.caisseOuverte = Boolean(etat.ouverte);
      this.rafraichirTotaux();
      return etat;
    } catch (_erreur) {
      this.caisseOuverte = false;
      return null;
    }
  },

  async ouvrirCaisseRapide() {
    const etat = await this.actualiserCaisse();
    if (etat?.ouverte) {
      annoncer('Caisse ouverte depuis ' + heureDe(etat.session.ouverteLe) + '.', 'succes');
      return;
    }
    const ouverte = await Journal.ouvrirCaisse();
    if (ouverte) {
      await this.actualiserCaisse();
      await this.activer();
      annoncer('Caisse ouverte. Vous pouvez encaisser.', 'succes');
    }
  },

  async rechercher(texte) {
    try {
      this.articlesTrouves = await appeler(window.caisse.articles.chercher({ texte }));
    } catch (erreur) {
      this.articlesTrouves = [];
    }
    this.afficherResultats();
  },

  afficherResultats() {
    const zone = $('#resultats-articles');
    vider(zone);

    if (this.articlesTrouves.length === 0) {
      zone.append(creer('p', { classe: 'vide', texte: 'Aucun article ne correspond.' }));
      return;
    }

    for (const article of this.articlesTrouves) {
      const restant = this.restantStock(article);
      const epuise = restant <= 0;
      const boutonChoisir = article.venteCarton && article.piecesParCarton > 1
        ? creer('button', {
          classe: 'mini-action',
          texte: 'Choisir carton / piece',
          attributs: { type: 'button', title: 'Vendre en cartons, en pieces, ou les deux' },
          sur: { click: (e) => { e.stopPropagation(); this.choisirQuantites(article); } },
        })
        : null;
      if (boutonChoisir && epuise) boutonChoisir.disabled = true;

      zone.append(creer('div', {
        classe: 'article' + (epuise ? ' epuise' : '') + (article.venteCarton ? ' conditionne' : ''),
        sur: { click: () => (epuise ? null : this.choisirQuantites(article)) },
      }, [
        creer('div', {}, [
          creer('div', { classe: 'designation', texte: article.designation }),
          creer('div', {
            classe: 'reference',
            texte: [article.reference, article.codeBarres, article.codeBarresCarton ? 'carton ' + article.codeBarresCarton : '']
              .filter(Boolean).join('  -  '),
          }),
          creer('div', { classe: 'reference', texte: article.conditionnement ?? ('1 carton = ' + piecesParCarton(article) + ' pieces') }),
        ]),
        creer('div', { classe: 'article-droite' }, [
          creer('div', { classe: 'prix montant', texte: formater(article.prixUnitaire) + ' / piece' }),
          article.venteCarton ? creer('div', {
            classe: 'prix-carton montant',
            texte: formater(prixUnite(article, 'carton')) + ' / carton',
          }) : creer('span'),
          creer('div', {
            classe: 'stock' + (restant > 0 && restant <= article.seuilAlerte ? ' bas' : ''),
            texte: epuise ? 'epuise' : formaterStock(restant, article),
          }),
          boutonChoisir ?? creer('span'),
        ]),
      ]));
    }
  },

  clePanier(reference, unite) {
    return reference + '|' + (unite ?? 'piece');
  },

  stockReserve(article) {
    return this.panier
      .filter((l) => l.reference === article.reference)
      .reduce((s, l) => s + l.quantite * l.facteurStock, 0);
  },

  restantStock(article) {
    return article.stock - this.stockReserve(article);
  },

  /**
   * Un code lu par la douchette. L'article part directement au panier : c'est
   * tout l'interet, le caissier n'a ni a chercher ni a viser.
   */
  async surCodeLu(code) {
    $('#champ-recherche').value = '';

    let article = null;
    try {
      article = await appeler(window.caisse.articles.parCodeBarres({ code }));
    } catch (erreur) {
      return annoncer(erreur.message, 'erreur');
    }

    if (article) {
      this.ajouter(article, article.uniteScannee ?? 'piece');
      await this.rechercher('');
      return;
    }

    // Code inconnu : le caissier ne peut rien en faire, l'administrateur si.
    if (App.utilisateur.role !== 'administrateur') {
      return annoncer('Code-barres inconnu : ' + code, 'erreur');
    }

    const creer = await confirmer(
      'Code-barres inconnu',
      'Aucun article ne porte le code ' + code + '. Voulez-vous creer cet article ?',
      "Creer l'article"
    );
    if (!creer) return;

    const nouvel = await Articles.editer(null, { codeBarres: code });
    if (nouvel) {
      this.ajouter(nouvel);
      await this.rechercher('');
    }
  },

  async choisirQuantites(article) {
    if (!article.venteCarton || article.piecesParCarton <= 1) {
      return this.ajouter(article, article.ventePiece === false ? 'carton' : 'piece');
    }

    const restant = this.restantStock(article);
    if (restant <= 0) return annoncer(article.designation + ' est en rupture de stock.', 'avertissement');

    const choix = await ouvrirBoite((fermer) => {
      const parCarton = piecesParCarton(article);
      const cartonsMax = Math.floor(restant / parCarton);
      const piecesMax = restant;
      const champCartons = creer('input', {
        attributs: { type: 'number', min: '0', max: String(cartonsMax), step: '1', value: '0' },
      });
      const champPieces = creer('input', {
        attributs: { type: 'number', min: '0', max: String(piecesMax), step: '1', value: '0' },
      });
      const message = creer('p', { classe: 'message erreur' });
      const resume = creer('div', { classe: 'resume-conditionnement' });

      const lire = () => ({
        cartons: Math.max(0, Number(champCartons.value) || 0),
        pieces: Math.max(0, Number(champPieces.value) || 0),
      });
      const redessiner = () => {
        const v = lire();
        const piecesStock = v.cartons * parCarton + v.pieces;
        const montant = v.cartons * prixUnite(article, 'carton') + v.pieces * prixUnite(article, 'piece');
        resume.textContent =
          'Sortie prevue : ' + formaterStock(piecesStock, article) +
          ' / total brut ' + formater(montant) +
          ' / stock apres ' + formaterStock(restant - piecesStock, article);
        resume.className = 'resume-conditionnement' + (piecesStock > restant ? ' mauvais' : '');
      };
      const valider = () => {
        const v = lire();
        if (!Number.isInteger(v.cartons) || !Number.isInteger(v.pieces)) {
          return afficherMessage(message, 'Les quantites doivent etre des entiers.');
        }
        if (v.cartons === 0 && v.pieces === 0) {
          return afficherMessage(message, 'Choisissez au moins une quantite.');
        }
        if (v.cartons * parCarton + v.pieces > restant) {
          return afficherMessage(message, 'Stock insuffisant : il reste ' + formaterStock(restant, article) + '.');
        }
        fermer(v);
      };
      champCartons.addEventListener('input', redessiner);
      champPieces.addEventListener('input', redessiner);
      for (const champ of [champCartons, champPieces]) {
        champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
      }

      const boutonsRapides = creer('div', { classe: 'choix-rapides' }, [
        creer('button', {
          classe: 'bouton discret', texte: '+1 carton', attributs: { type: 'button' },
          sur: { click: () => { champCartons.value = String((Number(champCartons.value) || 0) + 1); redessiner(); } },
        }),
        creer('button', {
          classe: 'bouton discret', texte: '+1 piece', attributs: { type: 'button' },
          sur: { click: () => { champPieces.value = String((Number(champPieces.value) || 0) + 1); redessiner(); } },
        }),
        creer('button', {
          classe: 'bouton discret', texte: 'Max cartons', attributs: { type: 'button' },
          sur: { click: () => { champCartons.value = String(cartonsMax); champPieces.value = '0'; redessiner(); } },
        }),
      ]);
      if (cartonsMax <= 0) boutonsRapides.firstChild.disabled = true;

      const boite = creer('div', { classe: 'boite-conditionnement' }, [
        creer('h3', { texte: 'Vendre ' + article.designation }),
        creer('p', {
          classe: 'aide',
          texte: 'Stock disponible : ' + formaterStock(restant, article) +
            ' — 1 carton = ' + parCarton + ' pieces.',
        }),
        message,
        creer('div', { classe: 'grille-conditionnement' }, [
          creer('label', { texte: 'Cartons' }, [champCartons]),
          creer('label', { texte: 'Pieces' }, [champPieces]),
        ]),
        creer('div', { classe: 'prix-conditionnement' }, [
          creer('span', { texte: 'Prix carton : ' + formater(prixUnite(article, 'carton')) }),
          creer('span', { texte: 'Prix piece : ' + formater(prixUnite(article, 'piece')) }),
        ]),
        boutonsRapides,
        resume,
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', attributs: { type: 'button' }, sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Ajouter au panier', attributs: { type: 'button' }, sur: { click: valider } }),
        ]),
      ]);
      redessiner();
      return boite;
    });

    if (!choix) return null;
    return this.ajouterConditionnement(article, choix);
  },

  ajouterConditionnement(article, { cartons = 0, pieces = 0 }) {
    const nbCartons = Number(cartons) || 0;
    const nbPieces = Number(pieces) || 0;
    if (!Number.isInteger(nbCartons) || !Number.isInteger(nbPieces) || nbCartons < 0 || nbPieces < 0) {
      return annoncer('Quantites invalides.', 'erreur');
    }
    const sortie = nbCartons * facteurUnite(article, 'carton') + nbPieces;
    if (sortie <= 0) return null;
    if (sortie > this.restantStock(article)) {
      return annoncer('Stock insuffisant : il reste ' + formaterStock(this.restantStock(article), article) + '.', 'avertissement');
    }
    if (nbCartons > 0) this.ajouter(article, 'carton', nbCartons, { silencieux: true });
    if (nbPieces > 0) this.ajouter(article, 'piece', nbPieces, { silencieux: true });
    annoncer(article.designation + ' : ' + nbCartons + ' carton(s) + ' + nbPieces + ' piece(s) ajoutes.');
    this.afficherPanier();
    this.afficherResultats();
    return true;
  },

  ajouter(article, unite = 'piece', quantite = 1, options = {}) {
    const uniteVente = unite === 'carton' ? 'carton' : 'piece';
    const facteurStock = facteurUnite(article, uniteVente);
    if (uniteVente === 'carton' && (!article.venteCarton || article.piecesParCarton <= 1)) {
      return annoncer(article.designation + ' ne se vend pas en carton.', 'avertissement');
    }
    if (uniteVente === 'piece' && article.ventePiece === false) {
      return annoncer(article.designation + ' ne se vend pas a la piece.', 'avertissement');
    }
    const qte = Number(quantite) || 1;
    if (!Number.isInteger(qte) || qte <= 0) return annoncer('Quantite invalide.', 'erreur');
    if (this.restantStock(article) < facteurStock * qte) {
      return annoncer(
        article.designation + ' : stock insuffisant (' + formaterStock(this.restantStock(article), article) + ').',
        'avertissement'
      );
    }

    const cle = this.clePanier(article.reference, uniteVente);
    const ligne = this.panier.find((l) => l.cle === cle);
    if (ligne) {
      ligne.quantite += qte;
      if (!options.silencieux) annoncer(article.designation + ' ' + ligne.quantite + ' ' + libelleUnite(uniteVente, ligne.quantite));
    } else {
      this.panier.push({
        cle,
        reference: article.reference,
        designation: article.designation,
        prixUnitaire: prixUnite(article, uniteVente),
        tauxTva: article.tauxTva,
        quantite: qte,
        uniteVente,
        facteurStock,
        piecesParCarton: piecesParCarton(article),
        remisePourcent: 0,
        stock: article.stock,
      });
      if (!options.silencieux) {
        annoncer(article.designation + '  ' + qte + ' ' + libelleUnite(uniteVente, qte) +
          ' a ' + formater(prixUnite(article, uniteVente)) + ' / ' + libelleUnite(uniteVente));
      }
    }
    if (!options.silencieux) {
      this.afficherPanier();
      this.afficherResultats();
    }
  },

  changerQuantite(cle, ecart) {
    const ligne = this.panier.find((l) => l.cle === cle);
    if (!ligne) return;
    const nouvelle = ligne.quantite + ecart;
    if (nouvelle <= 0) return this.retirer(cle);
    const reserveAutres = this.panier
      .filter((l) => l.reference === ligne.reference && l.cle !== cle)
      .reduce((s, l) => s + l.quantite * l.facteurStock, 0);
    if (reserveAutres + nouvelle * ligne.facteurStock > ligne.stock) {
      return annoncer('Stock insuffisant pour ' + ligne.designation + '.', 'avertissement');
    }
    ligne.quantite = nouvelle;
    this.afficherPanier();
    this.afficherResultats();
  },

  retirer(cle) {
    this.panier = this.panier.filter((l) => l.cle !== cle);
    this.afficherPanier();
    this.afficherResultats();
  },

  async definirRemiseLigne(ligne) {
    const valeur = await ouvrirBoite((fermer) => {
      const champ = creer('input', {
        attributs: { type: 'number', min: '0', max: '100', step: '1', value: String(ligne.remisePourcent) },
      });
      const valider = () => fermer(Number(champ.value));
      champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
      return creer('div', {}, [
        creer('h3', { texte: 'Remise sur ' + ligne.designation }),
        creer('label', { texte: 'Remise (%)' }, [champ]),
        creer('div', { classe: 'actions' }, [
          creer('button', { classe: 'bouton discret', texte: 'Annuler', sur: { click: () => fermer(null) } }),
          creer('button', { classe: 'bouton', texte: 'Appliquer', sur: { click: valider } }),
        ]),
      ]);
    });

    if (valeur !== null && Number.isFinite(valeur) && valeur >= 0 && valeur <= 100) {
      ligne.remisePourcent = valeur;
      this.afficherPanier();
    }
  },

  afficherPanier() {
    const zone = $('#lignes-panier');
    vider(zone);

    if (this.panier.length === 0) {
      zone.append(creer('p', { classe: 'vide', texte: 'Panier vide. Scannez un article, ou cherchez-le a gauche (F3).' }));
    }

    for (const ligne of this.panier) {
      const unite = ligne.uniteVente === 'carton'
        ? ' ' + libelleUnite('carton', ligne.quantite) + ' (' + ligne.facteurStock + ' pieces/carton)'
        : ' ' + libelleUnite('piece', ligne.quantite);
      const detail = ligne.quantite + unite + ' x ' + formater(ligne.prixUnitaire) +
        (ligne.remisePourcent > 0 ? '  -' + ligne.remisePourcent + ' %' : '');

      zone.append(creer('div', { classe: 'ligne-panier' }, [
        creer('div', {}, [
          creer('div', { classe: 'designation', texte: ligne.designation }),
          creer('div', {
            classe: 'detail', texte: detail,
            attributs: { title: 'Cliquer pour une remise sur cette ligne' },
            sur: { click: () => this.definirRemiseLigne(ligne) },
          }),
        ]),
        creer('div', { classe: 'quantite' }, [
          creer('button', { texte: '-', sur: { click: () => this.changerQuantite(ligne.cle, -1) } }),
          creer('span', { texte: String(ligne.quantite) }),
          creer('button', { texte: '+', sur: { click: () => this.changerQuantite(ligne.cle, 1) } }),
        ]),
        creer('div', {
          classe: 'total montant',
          texte: formater(Math.round(ligne.prixUnitaire * ligne.quantite * (1 - ligne.remisePourcent / 100))),
        }),
        creer('button', {
          classe: 'retirer', texte: 'x',
          attributs: { title: 'Retirer du panier' },
          sur: { click: () => this.retirer(ligne.cle) },
        }),
      ]));
    }

    this.rafraichirTotaux();
  },

  rafraichirTotaux() {
    const remiseGlobale = Number($('#remise-globale').value) || 0;
    try {
      this.totaux = window.caisse.calcul.panier(this.panier, { remiseGlobalePourcent: remiseGlobale });
    } catch (erreur) {
      this.totaux = null;
    }

    const total = this.totaux?.totalTtc ?? 0;
    $('#total-brut').textContent = formater(this.totaux?.totalBrut ?? 0);
    $('#total-tva').textContent = formater(this.totaux?.totalTva ?? 0);
    $('#total-ttc').textContent = formater(total);
    const manqueClient = this.mode === 'credit' && !this.clientCredit;
    $('#bouton-encaisser').disabled = this.panier.length === 0 || !this.caisseOuverte || manqueClient;
    $('#bouton-encaisser').textContent = this.panier.length === 0
      ? 'Encaisser'
      : !this.caisseOuverte
        ? 'Ouvrir la caisse avant encaissement'
        : manqueClient
          ? 'Choisir le client credit'
          : 'Encaisser ' + formater(total) + '  (F2)';
    this.rafraichirRendu();
  },

  choisirMode(mode) {
    this.mode = mode;
    for (const bouton of $$('#modes-paiement button')) {
      bouton.classList.toggle('actif', bouton.dataset.mode === mode);
    }
    $('#zone-especes').hidden = mode !== 'especes';
    $('#bloc-client-credit').hidden = mode !== 'credit';
    if (mode === 'especes') $('#montant-recu').focus();
    if (mode === 'credit' && !this.clientCredit) this.choisirClientCredit();
    this.rafraichirTotaux();
  },

  async choisirClientCredit() {
    const client = await Clients.choisir();
    if (client) {
      this.clientCredit = client;
      $('#client-credit-nom').textContent = client.nom + ' - solde ' + formater(client.solde);
      this.rafraichirTotaux();
    }
  },

  rafraichirRendu() {
    const du = window.caisse.calcul.arrondirEspeces(this.totaux?.totalTtc ?? 0);
    const recu = Number($('#montant-recu').value);
    const zone = $('#monnaie-rendue');

    if (!recu || recu < du) {
      zone.textContent = recu && recu < du ? 'manque ' + formater(du - recu) : '0 F';
      return;
    }
    zone.textContent = formater(window.caisse.calcul.rendreMonnaie(du, recu).rendu);
  },

  async encaisser() {
    if (this.panier.length === 0) return;
    const etat = await this.actualiserCaisse();
    if (!etat?.ouverte) {
      const ouvrir = await confirmer(
        'Caisse fermee',
        "Ouvrez la caisse avant d'enregistrer une vente.",
        'Ouvrir maintenant'
      );
      if (ouvrir) await this.ouvrirCaisseRapide();
      return;
    }
    if (this.mode === 'credit' && !this.clientCredit) {
      await this.choisirClientCredit();
      if (!this.clientCredit) return;
    }
    const bouton = $('#bouton-encaisser');
    bouton.disabled = true;

    try {
      const vente = await appeler(window.caisse.ventes.enregistrer({
        lignes: this.panier.map((l) => ({
          reference: l.reference,
          quantite: l.quantite,
          uniteVente: l.uniteVente,
          remisePourcent: l.remisePourcent,
        })),
        remiseGlobalePourcent: Number($('#remise-globale').value) || 0,
        clientId: this.mode === 'credit' ? this.clientCredit.id : null,
        paiement: {
          mode: this.mode,
          montantRecu: this.mode === 'especes' ? Number($('#montant-recu').value) || undefined : undefined,
        },
      }));

      this.reinitialiser();
      await this.rechercher($('#champ-recherche').value);
      await this.afficherTicket(vente);
    } catch (erreur) {
      await ouvrirBoite((fermer) =>
        creer('div', {}, [
          creer('h3', { texte: "L'encaissement n'a pas eu lieu" }),
          creer('p', { texte: erreur.message }),
          creer('div', { classe: 'actions' }, [
            creer('button', { classe: 'bouton', texte: "J'ai compris", sur: { click: () => fermer(null) } }),
          ]),
        ])
      );
    } finally {
      this.rafraichirTotaux();
    }
  },

  reinitialiser() {
    this.panier = [];
    this.clientCredit = null;
    this.mode = 'especes';
    for (const bouton of $$('#modes-paiement button')) {
      bouton.classList.toggle('actif', bouton.dataset.mode === 'especes');
    }
    $('#bloc-client-credit').hidden = true;
    $('#zone-especes').hidden = false;
    $('#client-credit-nom').textContent = 'Aucun client choisi';
    $('#remise-globale').value = '0';
    $('#montant-recu').value = '';
    this.afficherPanier();
  },

  async afficherTicket(vente) {
    await ouvrirBoite((fermer) => {
      const lignes = [
        creer('h3', { texte: 'Vente ' + vente.numero + ' enregistree' }),
        creer('pre', { classe: 'ticket', texte: apercuTicket(vente) }),
      ];

      const actions = creer('div', { classe: 'actions' }, [
        creer('button', {
          classe: 'bouton discret', texte: 'Imprimer',
          sur: {
            click: async (e) => {
              e.target.disabled = true;
              try { await appeler(window.caisse.ticket.imprimer({ id: vente.id })); }
              catch (erreur) { e.target.textContent = erreur.message; }
              finally { e.target.disabled = false; }
            },
          },
        }),
        creer('button', {
          classe: 'bouton discret', texte: 'PDF',
          sur: {
            click: async (e) => {
              e.target.disabled = true;
              try { await appeler(window.caisse.ticket.pdf({ id: vente.id })); }
              catch (erreur) { e.target.textContent = erreur.message; }
              finally { e.target.disabled = false; }
            },
          },
        }),
        creer('button', { classe: 'bouton', texte: 'Vente suivante', sur: { click: () => fermer(null) } }),
      ]);

      return creer('div', {}, [...lignes, actions]);
    });

    $('#champ-recherche').focus();
  },
};

/**
 * Apercu du ticket. C'est exactement la fonction qui alimente l'imprimante,
 * exposee par le pont : l'apercu ne peut donc pas s'ecarter du ticket imprime.
 */
function apercuTicket(vente) {
  return window.caisse.calcul.ticket({ boutique: App.boutique, vente }).join('\n');
}

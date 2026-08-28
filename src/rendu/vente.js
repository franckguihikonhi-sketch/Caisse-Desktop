'use strict';

/* Ecran de vente. Le panier vit ici, en memoire ; les totaux affiches viennent
   du meme calcul que celui du processus principal, mais l'enregistrement, lui,
   recalcule tout a partir de la base : l'ecran ne fait jamais foi. */

const Vente = {
  panier: [],
  mode: 'especes',
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
    $('#bouton-encaisser').addEventListener('click', () => this.encaisser());

    for (const bouton of $$('#modes-paiement button')) {
      bouton.addEventListener('click', () => this.choisirMode(bouton.dataset.mode));
    }

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
    $('#champ-recherche').focus();
    await this.rechercher('');
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
      const dejaAuPanier = this.panier.find((l) => l.reference === article.reference);
      const restant = article.stock - (dejaAuPanier?.quantite ?? 0);
      const epuise = restant <= 0;

      zone.append(creer('div', {
        classe: 'article' + (epuise ? ' epuise' : ''),
        sur: { click: () => (epuise ? null : this.ajouter(article)) },
      }, [
        creer('div', {}, [
          creer('div', { classe: 'designation', texte: article.designation }),
          creer('div', { classe: 'reference', texte: article.reference }),
        ]),
        creer('div', {}, [
          creer('div', { classe: 'prix montant', texte: formater(article.prixUnitaire) }),
          creer('div', {
            classe: 'stock' + (restant > 0 && restant <= article.seuilAlerte ? ' bas' : ''),
            texte: epuise ? 'epuise' : restant + ' en stock',
          }),
        ]),
      ]));
    }
  },

  ajouter(article) {
    const ligne = this.panier.find((l) => l.reference === article.reference);
    if (ligne) {
      if (ligne.quantite >= article.stock) return;
      ligne.quantite += 1;
    } else {
      this.panier.push({
        reference: article.reference,
        designation: article.designation,
        prixUnitaire: article.prixUnitaire,
        tauxTva: article.tauxTva,
        quantite: 1,
        remisePourcent: 0,
        stock: article.stock,
      });
    }
    this.afficherPanier();
    this.afficherResultats();
  },

  changerQuantite(reference, ecart) {
    const ligne = this.panier.find((l) => l.reference === reference);
    if (!ligne) return;
    const nouvelle = ligne.quantite + ecart;
    if (nouvelle <= 0) return this.retirer(reference);
    if (nouvelle > ligne.stock) return;
    ligne.quantite = nouvelle;
    this.afficherPanier();
    this.afficherResultats();
  },

  retirer(reference) {
    this.panier = this.panier.filter((l) => l.reference !== reference);
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
      zone.append(creer('p', { classe: 'vide', texte: 'Panier vide. Cherchez un article a gauche (F3).' }));
    }

    for (const ligne of this.panier) {
      const detail = ligne.quantite + ' x ' + formater(ligne.prixUnitaire) +
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
          creer('button', { texte: '-', sur: { click: () => this.changerQuantite(ligne.reference, -1) } }),
          creer('span', { texte: String(ligne.quantite) }),
          creer('button', { texte: '+', sur: { click: () => this.changerQuantite(ligne.reference, 1) } }),
        ]),
        creer('div', {
          classe: 'total montant',
          texte: formater(Math.round(ligne.prixUnitaire * ligne.quantite * (1 - ligne.remisePourcent / 100))),
        }),
        creer('button', {
          classe: 'retirer', texte: 'x',
          attributs: { title: 'Retirer du panier' },
          sur: { click: () => this.retirer(ligne.reference) },
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
    $('#bouton-encaisser').disabled = this.panier.length === 0;
    $('#bouton-encaisser').textContent =
      this.panier.length === 0 ? 'Encaisser' : 'Encaisser ' + formater(total) + '  (F2)';
    this.rafraichirRendu();
  },

  choisirMode(mode) {
    this.mode = mode;
    for (const bouton of $$('#modes-paiement button')) {
      bouton.classList.toggle('actif', bouton.dataset.mode === mode);
    }
    $('#zone-especes').hidden = mode !== 'especes';
    if (mode === 'especes') $('#montant-recu').focus();
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
    const bouton = $('#bouton-encaisser');
    bouton.disabled = true;

    try {
      const vente = await appeler(window.caisse.ventes.enregistrer({
        lignes: this.panier.map((l) => ({
          reference: l.reference, quantite: l.quantite, remisePourcent: l.remisePourcent,
        })),
        remiseGlobalePourcent: Number($('#remise-globale').value) || 0,
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
      bouton.disabled = this.panier.length === 0;
    }
  },

  reinitialiser() {
    this.panier = [];
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

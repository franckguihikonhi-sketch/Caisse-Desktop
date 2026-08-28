'use strict';

/*
 * Douchette code-barres.
 *
 * Une douchette USB se presente au systeme comme un clavier : elle tape les
 * chiffres du code puis appuie sur Entree. Rien ne la distingue d'un humain,
 * sauf la vitesse — elle envoie ses touches en quelques millisecondes, la ou
 * une main met des dixiemes de seconde. C'est ce seul critere qui separe un
 * code scanne d'une saisie au clavier.
 *
 * L'ecoute se fait en phase de capture, avant les champs de la page : quand une
 * lecture est reconnue, l'evenement est arrete net, sinon le champ de recherche
 * traiterait le meme Entree une seconde fois et l'article serait ajoute deux
 * fois.
 */

const Douchette = {
  // Au-dela, deux touches viennent d'une main, pas d'une douchette.
  DELAI_MAXIMAL_ENTRE_TOUCHES: 40,
  LONGUEUR_MINIMALE: 4,

  memoire: '',
  dernierInstant: 0,
  ecoute: false,

  /**
   * @param {(code: string) => void} surLecture  appele avec le code lu
   * @param {() => boolean} estActive  dit si la lecture doit etre prise en compte
   */
  ecouter(surLecture, estActive) {
    if (this.ecoute) return;
    this.ecoute = true;

    document.addEventListener('keydown', (evenement) => {
      if (!estActive()) return this.oublier();

      const instant = evenement.timeStamp;
      const ecart = instant - this.dernierInstant;

      if (evenement.key === 'Enter') {
        // La memoire ne s'allonge que sur des touches rapprochees : si elle a
        // atteint cette longueur, c'est qu'une douchette l'a remplie. Le dernier
        // ecart compte aussi, la douchette envoyant Entree dans la foulee.
        const code = this.memoire;
        const lecture = code.length >= this.LONGUEUR_MINIMALE &&
          ecart <= this.DELAI_MAXIMAL_ENTRE_TOUCHES;
        this.oublier();

        if (lecture) {
          // Arrete ici : ni le formulaire ni le champ de recherche ne le verront.
          evenement.preventDefault();
          evenement.stopPropagation();
          surLecture(code);
        }
        return;
      }

      // Une douchette n'envoie que des chiffres ; tout le reste casse la lecture.
      if (evenement.key.length !== 1 || !/\d/.test(evenement.key)) return this.oublier();

      this.memoire = ecart > this.DELAI_MAXIMAL_ENTRE_TOUCHES
        ? evenement.key
        : this.memoire + evenement.key;
      this.dernierInstant = instant;
    }, true);
  },

  oublier() {
    this.memoire = '';
    this.dernierInstant = 0;
  },
};

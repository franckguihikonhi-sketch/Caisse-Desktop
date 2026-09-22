'use strict';

/**
 * Mince adaptateur autour de node:sqlite pour garder l'API synchrone attendue
 * par le reste de l'application. On evite ainsi une dependance native externe :
 * sous Windows, l'installation ne demande plus Visual Studio Build Tools.
 */

const { DatabaseSync } = require('node:sqlite');

class BaseSqlite {
  constructor(chemin) {
    this.base = new DatabaseSync(chemin);
    this.profondeurTransaction = 0;
    this.numeroPointSauvegarde = 0;
  }

  exec(sql) {
    return this.base.exec(sql);
  }

  prepare(sql) {
    return this.base.prepare(sql);
  }

  close() {
    return this.base.close();
  }

  /**
   * Compatible avec les usages better-sqlite3 du projet :
   *   base.pragma('user_version', { simple: true })
   *   base.pragma('user_version = 3')
   */
  pragma(instruction, options = {}) {
    const sql = 'PRAGMA ' + instruction;
    const requete = this.base.prepare(sql);
    if (options.simple) {
      const ligne = requete.get();
      if (!ligne) return undefined;
      return Object.values(ligne)[0];
    }
    return requete.all();
  }

  /** Transaction synchrone, avec imbrication par SAVEPOINT. */
  transaction(traitement) {
    return (...args) => {
      const imbriquee = this.profondeurTransaction > 0;
      const point = 'sp_' + (++this.numeroPointSauvegarde);

      if (imbriquee) this.base.exec('SAVEPOINT ' + point);
      else this.base.exec('BEGIN');
      this.profondeurTransaction += 1;

      try {
        const resultat = traitement(...args);
        this.profondeurTransaction -= 1;
        if (imbriquee) this.base.exec('RELEASE SAVEPOINT ' + point);
        else this.base.exec('COMMIT');
        return resultat;
      } catch (erreur) {
        this.profondeurTransaction -= 1;
        if (imbriquee) {
          this.base.exec('ROLLBACK TO SAVEPOINT ' + point);
          this.base.exec('RELEASE SAVEPOINT ' + point);
        } else {
          this.base.exec('ROLLBACK');
        }
        throw erreur;
      }
    };
  }
}

module.exports = { BaseSqlite };

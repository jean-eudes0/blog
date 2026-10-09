import { purgerSessionsExpirees } from './sessions.js'

// Une session expirée est refusée à la lecture, mais sa ligne reste en base (voir docs/api.md §2).
// Cette purge la supprime : une fois au démarrage, puis toutes les heures.
//
// Renvoie une fonction ASYNCHRONE qui arrête la purge : elle empêche les prochains passages ET attend
// la fin de celui qui serait déjà en cours. À attendre (await) avant de fermer la base, sinon une
// purge en vol utiliserait une connexion déjà fermée ; et un test ne peut pas savoir si "arrêtée" veut dire
// "plus rien ne tourne" ou "un dernier passage va encore finir".
export function demarrerPurgeSessions(db, { intervalleMs = 60 * 60 * 1000, log = {} } = {}) {
  const enCours = new Set()

  const executer = async () => {
    try {
      const n = await purgerSessionsExpirees(db)
      if (n > 0) log.info?.({ sessionsSupprimees: n }, 'sessions expirées supprimées')
    } catch (err) {
      // Une purge ratée ne doit jamais faire tomber le serveur : elle sera retentée à l'heure suivante.
      log.error?.(err, 'échec de la purge des sessions')
    }
  }

  const lancer = () => {
    const passage = executer().finally(() => enCours.delete(passage))
    enCours.add(passage)
  }

  lancer()
  const minuteur = setInterval(lancer, intervalleMs)
  // unref : ce minuteur seul ne doit pas empêcher le processus de s'arrêter.
  minuteur.unref()

  return async () => {
    clearInterval(minuteur)
    await Promise.all(enCours)
  }
}
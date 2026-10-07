import { purgerSessionsExpirees } from './sessions.js'

// Une session expirée est refusée à la lecture, mais sa ligne reste en base (voir docs/api.md §2).
// Cette purge la supprime : une fois au démarrage, puis toutes les heures.
// Renvoie une fonction qui arrête la purge.
export function demarrerPurgeSessions(db, { intervalleMs = 60 * 60 * 1000, log = {} } = {}) {
  const executer = async () => {
    try {
      const n = await purgerSessionsExpirees(db)
      if (n > 0) log.info?.({ sessionsSupprimees: n }, 'sessions expirées supprimées')
    } catch (err) {
      // Une purge ratée ne doit jamais faire tomber le serveur : elle sera retentée à l'heure suivante.
      log.error?.(err, 'échec de la purge des sessions')
    }
  }

  executer()
  const minuteur = setInterval(executer, intervalleMs)
  // unref : ce minuteur seul ne doit pas empêcher le processus de s'arrêter.
  minuteur.unref()
  return () => clearInterval(minuteur)
}
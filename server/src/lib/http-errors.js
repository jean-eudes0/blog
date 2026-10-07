// Construit les erreurs HTTP de l'API au même endroit. Le gestionnaire central
// (plugins/errors.js) les transforme en { error: { code, message } } : voir docs/api.md §5.
// Leurs codes ne commencent jamais par FST_ (le gestionnaire masquerait ces codes-là).

export function erreurHttp(statusCode, code, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}

export const nonAuthentifie = () => erreurHttp(401, 'UNAUTHENTICATED', 'Authentification requise')
export const identifiantsInvalides = () => erreurHttp(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects')
export const interdit = (message = 'Accès refusé') => erreurHttp(403, 'FORBIDDEN', message)
export const nonTrouve = (message = 'Ressource introuvable') => erreurHttp(404, 'NOT_FOUND', message)
export const tropDeRequetes = () => erreurHttp(429, 'RATE_LIMITED', 'Trop de tentatives, réessaie dans une minute')
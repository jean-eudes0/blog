import fp from 'fastify-plugin'

function envoyerErreur(reply, statut, code, message, details) {
  reply.code(statut).send({ error: { code, message, ...(details ? { details } : {}) } })
}

// Nomme le champ en cause à partir d'une erreur Ajv. Pour "additionalProperties",
// Ajv ne donne ni instancePath utile ni missingProperty : on lit alors
// params.additionalProperty, qui contient le nom du champ en trop.
function nommerChamp(v) {
  if (v.instancePath) return v.instancePath.replace(/^\//, '')
  if (v.params?.missingProperty) return v.params.missingProperty
  if (v.params?.additionalProperty) return v.params.additionalProperty
  return '(corps)'
}

// Cette requête est-elle une page du site (à laisser à React Router) ? Oui si c'est une lecture,
// hors /api, et qu'elle ne demande pas un fichier. Un fichier absent (« /assets/app.js »,
// « /favicon.ico ») reste une vraie 404 : lui répondre par une page HTML ferait croire au
// navigateur qu'il a reçu son script. Une route inconnue sous /api reste la 404 JSON du §5.
function estPageDuClient(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  const chemin = request.url.split('?')[0]
  if (chemin === '/api' || chemin.startsWith('/api/')) return false
  return !chemin.split('/').pop().includes('.')
}

// clientDir : dossier du build React, ou null (API seule : tests, développement avec Vite).
export default fp(async function errorsPlugin(app, { clientDir = null } = {}) {
  app.setNotFoundHandler((request, reply) => {
    if (clientDir && estPageDuClient(request)) {
      return reply.sendFile('index.html')
    }
    envoyerErreur(reply, 404, 'NOT_FOUND', 'Route inconnue')
  })

  app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      const details = err.validation.map((v) => ({
        field: nommerChamp(v),
        message: v.message,
      }))
      envoyerErreur(reply, 400, 'VALIDATION_ERROR', 'Données invalides', details)
      return
    }

    if (err.statusCode && err.statusCode < 500) {
      const aUnCodeMetier = err.code && !String(err.code).startsWith('FST_')
      if (aUnCodeMetier) {
        envoyerErreur(reply, err.statusCode, err.code, err.message)
        return
      }
      // 403 sans code métier : refus du serveur de fichiers (dossier demandé, chemin interdit).
      if (err.statusCode === 403) {
        envoyerErreur(reply, 403, 'FORBIDDEN', 'Accès refusé')
        return
      }
      envoyerErreur(reply, err.statusCode, 'VALIDATION_ERROR', 'Requête invalide')
      return
    }

    request.log.error(err)
    envoyerErreur(reply, 500, 'INTERNAL_ERROR', 'Une erreur interne est survenue')
  })
})
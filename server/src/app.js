import Fastify from 'fastify'
import errorsPlugin from './plugins/errors.js'
import articlesRoutes from './routes/articles.js'
import tagsRoutes from './routes/tags.js'

export function buildApp({ db, nodeEnv = 'development' } = {}) {
  const app = Fastify({
    logger: {
      level: nodeEnv === 'test' ? 'silent' : 'info',
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password'],
        censor: '[masqué]',
      },
    },
    bodyLimit: 512 * 1024,
    // Par défaut Fastify SUPPRIME en silence les champs en trop au lieu de
    // les refuser. Avec false, additionalProperties: false renvoie bien un 400
    // (voir docs/api.md §6).
    ajv: { customOptions: { removeAdditional: false } },
    frameworkErrors: (err, request, reply) => {
      reply.code(err.statusCode ?? 400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Requête invalide' },
      })
    },
  })

  app.decorate('db', db)
  app.register(errorsPlugin)

  // Vérifie seulement que la base répond, sans rien révéler de son contenu.
  app.get('/api/health', async () => {
    await app.db.query('SELECT 1')
    return { status: 'ok' }
  })

  app.register(articlesRoutes)
  app.register(tagsRoutes)

  if (nodeEnv === 'test') {
    app.get('/api/_boom', async () => {
      throw new Error('boom')
    })
    app.post(
      '/api/_echo',
      { schema: { body: { type: 'object', required: ['nom'], properties: { nom: { type: 'string' } } } } },
      async (request) => request.body
    )
  }

  return app
}
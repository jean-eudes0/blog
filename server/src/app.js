import Fastify from 'fastify'
import errorsPlugin from './plugins/errors.js'

// buildApp construit l'application SANS écouter de port : les tests
// peuvent ainsi lui envoyer des requêtes directement en mémoire avec
// app.inject(), sans dépendre d'un vrai réseau ni d'une vraie base.
export function buildApp({ db, nodeEnv = 'development' } = {}) {
  const app = Fastify({
    logger: {
      level: nodeEnv === 'test' ? 'silent' : 'info',
      // Ne jamais faire fuiter un cookie ou un mot de passe dans les logs.
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password'],
        censor: '[masqué]',
      },
    },
    bodyLimit: 512 * 1024, // 512 Ko, voir docs/api.md §8
  })

  app.decorate('db', db)
  app.register(errorsPlugin)

  app.get('/api/health', async () => {
    const { count } = app.db
      .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'")
      .get()
    return { status: 'ok', tables: count }
  })

  // Route réservée aux tests de l'étape 1, pour vérifier que le
  // gestionnaire d'erreurs traite bien une exception inattendue.
  // Elle est retirée dès que l'étape 3 apporte de vraies routes.
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

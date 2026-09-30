import Fastify from 'fastify'
import errorsPlugin from './plugins/errors.js'

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
  })

  app.decorate('db', db)
  app.register(errorsPlugin)

  app.get('/api/health', async () => {
    const { rows } = await app.db.query(
      `SELECT count(*)::int AS count
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name != 'schema_migrations'`
    )
    return { status: 'ok', tables: rows[0].count }
  })

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

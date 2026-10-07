import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import errorsPlugin from './plugins/errors.js'
import authPlugin from './plugins/auth.js'
import originePlugin from './plugins/origine.js'
import authRoutes from './routes/auth.js'
import articlesRoutes from './routes/articles.js'
import tagsRoutes from './routes/tags.js'
import { tropDeRequetes } from './lib/http-errors.js'

export function buildApp({
  db,
  nodeEnv = 'development',
  // Adresse publique du site : sert au contrôle d'origine (docs/api.md §2).
  publicUrl = 'http://localhost:5173',
  // Proxys de confiance (liste d'adresses ou de plages), false = aucun. Voir docs/api.md §8.
  trustProxy = false,
  // Limite de tentatives sur la connexion : 5 par minute et par IP.
  limiteLogin = { max: 5, timeWindow: '1 minute' },
} = {}) {
  const app = Fastify({
    logger: {
      level: nodeEnv === 'test' ? 'silent' : 'info',
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password'],
        censor: '[masqué]',
      },
    },
    bodyLimit: 512 * 1024,
    // Sans cela, X-Forwarded-For est ignoré : l'IP du visiteur est alors celle du proxy de l'hébergeur.
    trustProxy,
    // Par défaut Fastify SUPPRIME en silence les champs en trop au lieu de
    // les refuser. Avec false, additionalProperties: false renvoie bien un 400
    // (voir docs/api.md §6).
    ajv: { customOptions: { removeAdditional: false } },
    // Erreurs levées par le routeur avant tout handler (ex: paramètre d'URL trop long) :
    // sans ceci, elles sortent au format Fastify avec un code FST_*.
    frameworkErrors: (err, request, reply) => {
      reply.code(err.statusCode ?? 400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Requête invalide' },
      })
    },
  })

  app.decorate('db', db)
  app.register(errorsPlugin)
  app.register(originePlugin, { publicUrl })
  app.register(authPlugin, { secure: nodeEnv === 'production' })
  // global: false : la limitation ne s'applique qu'aux routes qui la demandent.
  // Sans errorResponseBuilder, un 429 sortirait avec le code VALIDATION_ERROR.
  app.register(rateLimit, { global: false, errorResponseBuilder: () => tropDeRequetes() })

  // Vérifie seulement que la base répond, sans rien révéler de son contenu.
  app.get('/api/health', async () => {
    await app.db.query('SELECT 1')
    return { status: 'ok' }
  })

  app.register(authRoutes, { limiteLogin })
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
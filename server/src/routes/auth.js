import { trouverParEmail, verifierMotDePasse } from '../lib/users.js'
import { NOM_COOKIE, creerSession, supprimerSession } from '../lib/sessions.js'
import { identifiantsInvalides } from '../lib/http-errors.js'

// Connexion, déconnexion, utilisateur courant (voir docs/api.md §4).

const utilisateurSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    email: { type: 'string' },
    role: { type: 'string' },
  },
}

export default async function authRoutes(app, { limiteLogin }) {
  app.post(
    '/api/auth/login',
    {
      // Limite par adresse IP : voir l'option trustProxy dans app.js pour savoir de quelle IP il s'agit.
      config: { rateLimit: { max: limiteLogin.max, timeWindow: limiteLogin.timeWindow } },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            password: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
        response: { 200: { type: 'object', properties: { user: utilisateurSchema } } },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body
      const trouve = await trouverParEmail(app.db, email)
      // Toujours une comparaison bcrypt, même si l'e-mail est inconnu (voir verifierMotDePasse).
      const correct = await verifierMotDePasse(password, trouve?.password_hash)
      if (!trouve || !correct) {
        // Jamais l'e-mail ni le mot de passe dans les logs : seulement l'adresse IP.
        request.log.warn({ ip: request.ip }, 'échec de connexion')
        throw identifiantsInvalides()
      }

      const user = { id: trouve.id, email: trouve.email, role: trouve.role }
      // Une connexion = une NOUVELLE session. L'ancienne (si le navigateur en avait une) est supprimée.
      await supprimerSession(app.db, request.cookies?.[NOM_COOKIE])
      const jeton = await creerSession(app.db, user.id)
      app.poserCookieSession(reply, jeton)
      return { user }
    }
  )

  // Idempotente : répond 204 même sans session valide.
  app.post('/api/auth/logout', async (request, reply) => {
    await supprimerSession(app.db, request.cookies?.[NOM_COOKIE])
    app.effacerCookieSession(reply)
    return reply.code(204).send()
  })

  app.get(
    '/api/auth/me',
    {
      onRequest: app.exigerSession,
      schema: { response: { 200: { type: 'object', properties: { user: utilisateurSchema } } } },
    },
    async (request) => ({ user: request.user })
  )
}
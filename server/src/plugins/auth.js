import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import { NOM_COOKIE, DUREE_SESSION_SECONDES, trouverUtilisateur } from '../lib/sessions.js'

// Lecture du cookie de session (voir docs/api.md §2).
// Fournit :
//   app.exigerSession      : hook onRequest pour les routes protégées (401 sinon)
//   app.chargerUtilisateur : renvoie l'utilisateur ou null, sans jamais échouer
//   app.poserCookieSession / app.effacerCookieSession : pour login et logout
export default fp(async function authPlugin(app, { secure = false } = {}) {
  await app.register(cookie)

  app.decorateRequest('user', null)

  const optionsCookie = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  }

  app.decorate('poserCookieSession', (reply, jeton) => {
    reply.setCookie(NOM_COOKIE, jeton, { ...optionsCookie, maxAge: DUREE_SESSION_SECONDES })
  })

  app.decorate('effacerCookieSession', (reply) => {
    reply.clearCookie(NOM_COOKIE, optionsCookie)
  })

  app.decorate('chargerUtilisateur', async (request) => {
    const user = await trouverUtilisateur(app.db, request.cookies?.[NOM_COOKIE])
    request.user = user
    return user
  })

  app.decorate('exigerSession', async (request) => {
    const user = await app.chargerUtilisateur(request)
    if (!user) {
      const err = new Error('Authentification requise')
      err.statusCode = 401
      err.code = 'UNAUTHENTICATED'
      throw err
    }
  })
})
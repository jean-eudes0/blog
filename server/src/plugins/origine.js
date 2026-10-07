import fp from 'fastify-plugin'
import { interdit } from '../lib/http-errors.js'

// Contrôle d'origine (voir docs/api.md §2, protection CSRF) : une requête qui MODIFIE des
// données doit venir de notre propre site. SameSite=Lax protège déjà le cookie ; ceci est la seconde barrière.
//  - En-tête Origin présent  -> doit correspondre exactement à l'origine de PUBLIC_URL.
//  - Sinon, Referer présent  -> son origine doit correspondre.
//  - Aucun des deux          -> accepté (curl, scripts : pas un navigateur, donc pas de CSRF).
// L'origine attendue vient de la configuration, jamais de l'en-tête Host, que le client contrôle.

const METHODES_SANS_MODIFICATION = new Set(['GET', 'HEAD', 'OPTIONS'])

function origineDe(valeur) {
  try {
    return new URL(valeur).origin
  } catch {
    return null // par exemple l'en-tête "Origin: null" envoyé par certains contextes isolés
  }
}

export default fp(async function originePlugin(app, { publicUrl }) {
  const attendue = new URL(publicUrl).origin

  app.addHook('onRequest', async (request) => {
    if (METHODES_SANS_MODIFICATION.has(request.method)) return

    const { origin, referer } = request.headers
    if (origin !== undefined) {
      if (origineDe(origin) !== attendue) throw interdit('Origine refusée')
      return
    }
    if (referer !== undefined && origineDe(referer) !== attendue) throw interdit('Origine refusée')
  })
})
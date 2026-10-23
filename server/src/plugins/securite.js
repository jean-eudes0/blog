import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'

// En-têtes de sécurité de toutes les réponses, API comprise (docs/api.md §8).
// Le plus important est la politique CSP : même si du script malveillant arrivait dans une page
// (un article mal nettoyé), le navigateur refuserait de l'exécuter, puisque seuls les scripts
// venant de notre propre site sont autorisés. C'est une seconde barrière après DOMPurify.
export default fp(async function securitePlugin(app, { production = false } = {}) {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"], // pas de script en ligne, pas d'eval : le build de Vite n'en a pas besoin
        'style-src': ["'self'"],
        // https: pour les images de couverture hébergées ailleurs (coverUrl est limité à https://).
        // data: pour les petites images que Vite peut intégrer directement dans le CSS.
        'img-src': ["'self'", 'https:', 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"], // les appels à l'API restent sur la même origine
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"], // le site ne peut être affiché dans aucun cadre (clickjacking)
        // Seulement en production : sur http://localhost, ce réglage forcerait le navigateur à demander du https.
        ...(production ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    // « require-corp » bloquerait les images de couverture hébergées sur d'autres sites.
    crossOriginEmbedderPolicy: false,
    // Ce site ne sera jamais servi en http en production. Désactivé ailleurs : sans effet sur http.
    strictTransportSecurity: production ? { maxAge: 31536000 } : false,
  })
})
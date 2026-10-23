import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'

// Sert le build du client React (client/dist) : fichiers statiques seulement. La page
// d'accueil et les routes de React Router (« /articles/mon-slug », « /admin »...) passent par
// le gestionnaire « route inconnue » (plugins/errors.js), qui renvoie index.html.
export default fp(async function clientPlugin(app, { clientDir }) {
  await app.register(fastifyStatic, {
    root: clientDir,
    index: false,
    dotfiles: 'ignore', // un fichier caché oublié dans dist/ (.env...) ne doit jamais être servi : 404
    cacheControl: false, // les en-têtes de cache sont posés plus bas, fichier par fichier
    // Depuis @fastify/static 8+, le premier argument est l'objet réponse de Fastify (reply), pas la réponse brute.
    setHeaders(reply, chemin) {
      const nom = chemin.split(/[\\/]/).pop()
      if (nom === 'index.html') {
        // Jamais gardé sans revalidation : sinon un visiteur garderait l'ancienne version du site
        // après un déploiement, avec des noms de fichiers /assets/ qui n'existent plus.
        reply.header('Cache-Control', 'no-cache')
      } else if (/[\\/]assets[\\/]/.test(chemin)) {
        // Vite met une empreinte du contenu dans le nom (index-Bp0AmuC7.js) : le fichier ne change jamais.
        reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        reply.header('Cache-Control', 'public, max-age=3600')
      }
    },
  })

  // « / » : @fastify/static répondrait 403 pour un dossier sans fichier d'index, on sert donc
  // index.html nous-mêmes. Les autres pages passent par le gestionnaire « route inconnue ».
  app.get('/', (request, reply) => reply.sendFile('index.html'))
})
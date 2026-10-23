import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { buildApp } from './app.js'
import { demarrerPurgeSessions } from './lib/purge-sessions.js'

let config
let db

try {
  config = loadConfig()
  db = await openDb(config.databaseUrl)
} catch (err) {
  console.error(`Démarrage impossible : ${err.message}`)
  process.exit(1)
}

// Le build du client (npm run build dans client/) est servi par ce même serveur, sur la même origine.
// Sans build, le serveur ne sert que l'API (développement : le client tourne alors sur Vite).
const clientDir = path.resolve(import.meta.dirname, '../../client/dist')
const clientPresent = existsSync(path.join(clientDir, 'index.html'))

const app = buildApp({
  db,
  nodeEnv: config.nodeEnv,
  publicUrl: config.publicUrl,
  trustProxy: config.trustProxy,
  clientDir: clientPresent ? clientDir : null,
})
app.log.info(clientPresent ? `Client servi depuis ${clientDir}` : 'Aucun build du client trouvé : API seule')

const arreterPurge = demarrerPurgeSessions(db, { log: app.log })

app.addHook('onClose', async () => {
  await arreterPurge()
  await db.end()
})

let arretEnCours = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (arretEnCours) return
    arretEnCours = true
    app.log.info(`${signal} reçu, arrêt propre`)
    await app.close()
    process.exit(0)
  })
}

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
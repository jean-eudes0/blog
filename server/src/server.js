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

const app = buildApp({
  db,
  nodeEnv: config.nodeEnv,
  publicUrl: config.publicUrl,
  trustProxy: config.trustProxy,
})

const arreterPurge = demarrerPurgeSessions(db, { log: app.log })

app.addHook('onClose', async () => {
  arreterPurge()
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
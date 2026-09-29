import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { buildApp } from './app.js'

const config = loadConfig()
const db = openDb(config.dbFile)
const app = buildApp({ db, nodeEnv: config.nodeEnv })

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

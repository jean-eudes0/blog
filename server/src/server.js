import Fastify from 'fastify'
import { openDb } from './db.js'

const app = Fastify({ logger: true })
const db = openDb(process.env.DB_FILE ?? 'blog.db')

app.get('/health', async () => {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
  return { status: 'ok', tables: tables.map((t) => t.name) }
})

await app.listen({ port: 3000 })
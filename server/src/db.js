import pg from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
const dossier = path.dirname(fileURLToPath(import.meta.url))
const dossierMigrations = path.join(dossier, '..', 'migrations')

// Identifiant arbitraire pour le verrou consultatif PostgreSQL (voir migrer()).
const VERROU_MIGRATIONS = 727384

export async function openDb(connectionString) {
  const { hostname } = new URL(connectionString)
  const estLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const pool = new Pool({
    connectionString,
    ssl: estLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
  })

  // Sans écouteur, une connexion inactive coupée par l'hébergeur (fréquent
  // avec une base gratuite qui se met en veille) ferait planter le processus.
  pool.on('error', (err) => {
    console.error('Connexion inactive perdue :', err.message)
  })

  await migrer(pool)
  return pool
}

async function migrer(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verrou consultatif de TRANSACTION : il empêche deux processus
    // d'appliquer les migrations en même temps (fichiers de test en
    // parallèle, deux instances qui démarrent ensemble) et il est libéré
    // tout seul au COMMIT ou au ROLLBACK, sans unlock manuel à oublier.
    await client.query('SELECT pg_advisory_xact_lock($1)', [VERROU_MIGRATIONS])

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const { rows } = await client.query('SELECT filename FROM schema_migrations')
    const dejaAppliquees = new Set(rows.map((r) => r.filename))

    const fichiers = readdirSync(dossierMigrations)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const fichier of fichiers) {
      if (dejaAppliquees.has(fichier)) continue
      await client.query(readFileSync(path.join(dossierMigrations, fichier), 'utf8'))
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [fichier])
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
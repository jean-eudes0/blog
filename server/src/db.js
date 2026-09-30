import pg from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
const dossier = path.dirname(fileURLToPath(import.meta.url))
const dossierMigrations = path.join(dossier, '..', 'migrations')

// Identifiant arbitraire pour le verrou consultatif PostgreSQL (voir migrer()).
// N'importe quel entier 64 bits fixe convient, du moment qu'il est stable.
const VERROU_MIGRATIONS = 727384

export async function openDb(connectionString) {
  const { hostname } = new URL(connectionString)
  const estLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const pool = new Pool({
    connectionString,
    ssl: estLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  })
  await migrer(pool)
  return pool
}

async function migrer(pool) {
  const client = await pool.connect()
  try {
    // Verrou consultatif : empêche deux processus d'appliquer les migrations
    // en même temps (deux fichiers de test lancés en parallèle par
    // `node --test`, ou deux instances du serveur qui démarrent ensemble
    // après un déploiement). Sans lui, deux `CREATE EXTENSION IF NOT EXISTS`
    // concurrents peuvent tous les deux voir "n'existe pas" au même instant
    // et se percuter sur le catalogue système de PostgreSQL.
    // pg_advisory_lock bloque jusqu'à obtention : le second processus attend
    // simplement que le premier ait fini, puis n'a plus rien à appliquer.
    await client.query('SELECT pg_advisory_lock($1)', [VERROU_MIGRATIONS])

    try {
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
        try {
          await client.query('BEGIN')
          await client.query(readFileSync(path.join(dossierMigrations, fichier), 'utf8'))
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [fichier])
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [VERROU_MIGRATIONS])
    }
  } finally {
    client.release()
  }
}
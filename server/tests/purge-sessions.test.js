import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getTestDb, resetDb } from './helpers.js'
import { creerSession } from '../src/lib/sessions.js'
import { demarrerPurgeSessions } from '../src/lib/purge-sessions.js'

const dossierServer = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let db
let userId

before(async () => {
  db = await getTestDb()
})

beforeEach(async () => {
  await resetDb(db)
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash) VALUES ('moi@exemple.com', 'h') RETURNING id`
  )
  userId = rows[0].id
})

after(async () => {
  if (db) await db.end()
})

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function nombreSessions() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  return rows[0].n
}

test('la purge s\'exécute dès le démarrage : les sessions expirées disparaissent, les valides restent', async () => {
  await creerSession(db, userId)
  await creerSession(db, userId)
  await db.query(`UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE id = (SELECT id FROM sessions LIMIT 1)`)
  const arreter = demarrerPurgeSessions(db, { intervalleMs: 3_600_000 })
  await attendre(300)
  arreter()
  assert.equal(await nombreSessions(), 1)
})

test('la purge se répète à intervalle régulier', async () => {
  const arreter = demarrerPurgeSessions(db, { intervalleMs: 100 })
  await attendre(200)
  await creerSession(db, userId)
  await db.query(`UPDATE sessions SET expires_at = now() - interval '1 hour'`)
  await attendre(400)
  arreter()
  assert.equal(await nombreSessions(), 0)
})

test('une fois arrêtée, la purge ne supprime plus rien', async () => {
  const arreter = demarrerPurgeSessions(db, { intervalleMs: 100 })
  await attendre(200)
  arreter()
  await creerSession(db, userId)
  await db.query(`UPDATE sessions SET expires_at = now() - interval '1 hour'`)
  await attendre(400)
  assert.equal(await nombreSessions(), 1)
})

test('une purge qui échoue est journalisée et ne fait pas planter le processus', async () => {
  const erreurs = []
  const baseCassee = { query: async () => { throw new Error('base indisponible') } }
  const arreter = demarrerPurgeSessions(baseCassee, { intervalleMs: 100, log: { error: (err, msg) => erreurs.push([err.message, msg]) } })
  await attendre(350)
  arreter()
  assert.ok(erreurs.length >= 2, 'la purge doit être retentée')
  assert.deepEqual(erreurs[0], ['base indisponible', 'échec de la purge des sessions'])
})

test('le minuteur n\'empêche pas le processus de s\'arrêter (unref)', () => {
  const code = `
    import { demarrerPurgeSessions } from './src/lib/purge-sessions.js'
    demarrerPurgeSessions({ query: async () => ({ rowCount: 0 }) }, { intervalleMs: 3_600_000 })
  `
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: dossierServer,
    timeout: 5000,
  })
  assert.equal(r.error, undefined, 'le processus ne s\'est pas arrêté tout seul')
  assert.equal(r.status, 0)
})
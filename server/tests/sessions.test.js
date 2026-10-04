import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { getTestDb, resetDb } from './helpers.js'
import {
  creerSession,
  trouverUtilisateur,
  supprimerSession,
  purgerSessionsExpirees,
  empreinte,
} from '../src/lib/sessions.js'

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

test('creerSession renvoie un jeton aléatoire de 32 octets (43 caractères base64url)', async () => {
  const jeton = await creerSession(db, userId)
  assert.match(jeton, /^[A-Za-z0-9_-]{43}$/)
})

test('la base ne stocke que l\'empreinte SHA-256 du jeton, jamais le jeton', async () => {
  const jeton = await creerSession(db, userId)
  const { rows } = await db.query('SELECT id FROM sessions')
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].id, jeton)
  assert.equal(rows[0].id, createHash('sha256').update(jeton).digest('hex'))
  assert.equal(rows[0].id, empreinte(jeton))
})

test('chaque connexion crée une nouvelle session avec un jeton différent', async () => {
  const a = await creerSession(db, userId)
  const b = await creerSession(db, userId)
  assert.notEqual(a, b)
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  assert.equal(rows[0].n, 2)
})

test('la session expire dans 7 jours (calculé par la base)', async () => {
  await creerSession(db, userId)
  const { rows } = await db.query(
    `SELECT extract(epoch FROM (expires_at - created_at)) AS secondes FROM sessions`
  )
  assert.ok(Math.abs(rows[0].secondes - 7 * 24 * 3600) < 2)
})

test('trouverUtilisateur renvoie id, email et rôle pour un jeton valide', async () => {
  const jeton = await creerSession(db, userId)
  const user = await trouverUtilisateur(db, jeton)
  assert.deepEqual(user, { id: userId, email: 'moi@exemple.com', role: 'admin' })
})

test('trouverUtilisateur ne renvoie jamais le hash du mot de passe', async () => {
  const jeton = await creerSession(db, userId)
  const user = await trouverUtilisateur(db, jeton)
  assert.equal(user.password_hash, undefined)
})

test('trouverUtilisateur renvoie null pour un jeton inconnu', async () => {
  await creerSession(db, userId)
  assert.equal(await trouverUtilisateur(db, 'jeton-inconnu'), null)
})

test('trouverUtilisateur renvoie null pour une valeur absente ou démesurée', async () => {
  assert.equal(await trouverUtilisateur(db, undefined), null)
  assert.equal(await trouverUtilisateur(db, ''), null)
  assert.equal(await trouverUtilisateur(db, 'x'.repeat(5000)), null)
})

test('une session expirée est refusée même si sa ligne existe encore', async () => {
  const jeton = await creerSession(db, userId)
  await db.query(`UPDATE sessions SET expires_at = now() - interval '1 second'`)
  assert.equal(await trouverUtilisateur(db, jeton), null)
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  assert.equal(rows[0].n, 1)
})

test('supprimerSession révoque immédiatement la session', async () => {
  const jeton = await creerSession(db, userId)
  await supprimerSession(db, jeton)
  assert.equal(await trouverUtilisateur(db, jeton), null)
})

test('supprimerSession est idempotente (jeton inconnu, absent ou répété)', async () => {
  const jeton = await creerSession(db, userId)
  await supprimerSession(db, jeton)
  await supprimerSession(db, jeton)
  await supprimerSession(db, 'inconnu')
  await supprimerSession(db, undefined)
})

test('supprimerSession ne touche pas aux autres sessions', async () => {
  const a = await creerSession(db, userId)
  const b = await creerSession(db, userId)
  await supprimerSession(db, a)
  assert.equal(await trouverUtilisateur(db, a), null)
  assert.ok(await trouverUtilisateur(db, b))
})

test('purgerSessionsExpirees ne supprime que les sessions expirées et renvoie leur nombre', async () => {
  const valide = await creerSession(db, userId)
  const expiree1 = await creerSession(db, userId)
  const expiree2 = await creerSession(db, userId)
  await db.query(`UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE id = ANY($1)`, [
    [empreinte(expiree1), empreinte(expiree2)],
  ])
  assert.equal(await purgerSessionsExpirees(db), 2)
  assert.ok(await trouverUtilisateur(db, valide))
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  assert.equal(rows[0].n, 1)
})

test('supprimer un utilisateur supprime ses sessions (CASCADE)', async () => {
  await creerSession(db, userId)
  await db.query('DELETE FROM users WHERE id = $1', [userId])
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  assert.equal(rows[0].n, 0)
})
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { getTestDb, resetDb } from './helpers.js'
import { creerSession, supprimerSession } from '../src/lib/sessions.js'

let db
let app
let userId

before(async () => {
  db = await getTestDb()
  app = buildApp({ db, nodeEnv: 'test' })
  // Route protégée jetable, enregistrée seulement pour ces tests.
  app.register(async (instance) => {
    instance.get('/api/_protegee', { onRequest: instance.exigerSession }, async (request) => ({
      email: request.user.email,
    }))
    instance.get('/api/_facultative', async (request) => {
      const user = await instance.chargerUtilisateur(request)
      return { connecte: user !== null }
    })
    instance.get('/api/_pose-cookie', async (request, reply) => {
      instance.poserCookieSession(reply, 'jeton-de-test')
      return { ok: true }
    })
    instance.get('/api/_efface-cookie', async (request, reply) => {
      instance.effacerCookieSession(reply)
      return { ok: true }
    })
  })
})

beforeEach(async () => {
  await resetDb(db)
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash) VALUES ('moi@exemple.com', 'h') RETURNING id`
  )
  userId = rows[0].id
})

after(async () => {
  if (app) await app.close()
  if (db) await db.end()
})

test('sans cookie, une route protégée répond 401 UNAUTHENTICATED au format du §5', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/_protegee' })
  assert.equal(res.statusCode, 401)
  assert.equal(res.json().error.code, 'UNAUTHENTICATED')
})

test('avec un cookie de session valide, la route protégée répond 200 et connaît l\'utilisateur', async () => {
  const jeton = await creerSession(db, userId)
  const res = await app.inject({ method: 'GET', url: '/api/_protegee', cookies: { sid: jeton } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().email, 'moi@exemple.com')
})

test('un cookie avec un jeton inventé répond 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/_protegee', cookies: { sid: 'invente' } })
  assert.equal(res.statusCode, 401)
})

test('une session expirée répond 401', async () => {
  const jeton = await creerSession(db, userId)
  await db.query(`UPDATE sessions SET expires_at = now() - interval '1 second'`)
  const res = await app.inject({ method: 'GET', url: '/api/_protegee', cookies: { sid: jeton } })
  assert.equal(res.statusCode, 401)
})

test('une session révoquée répond 401 immédiatement', async () => {
  const jeton = await creerSession(db, userId)
  assert.equal((await app.inject({ method: 'GET', url: '/api/_protegee', cookies: { sid: jeton } })).statusCode, 200)
  await supprimerSession(db, jeton)
  assert.equal((await app.inject({ method: 'GET', url: '/api/_protegee', cookies: { sid: jeton } })).statusCode, 401)
})

test('un autre cookie que sid ne donne aucun accès', async () => {
  const jeton = await creerSession(db, userId)
  const res = await app.inject({ method: 'GET', url: '/api/_protegee', cookies: { autre: jeton } })
  assert.equal(res.statusCode, 401)
})

test('chargerUtilisateur ne lève jamais d\'erreur : il renvoie simplement connecte true ou false', async () => {
  const anonyme = await app.inject({ method: 'GET', url: '/api/_facultative' })
  assert.deepEqual(anonyme.json(), { connecte: false })
  const jeton = await creerSession(db, userId)
  const connecte = await app.inject({ method: 'GET', url: '/api/_facultative', cookies: { sid: jeton } })
  assert.deepEqual(connecte.json(), { connecte: true })
})

test('le cookie posé est HttpOnly, SameSite=Lax, Path=/, valable 7 jours, sans Secure hors production', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/_pose-cookie' })
  const cookie = res.cookies.find((c) => c.name === 'sid')
  assert.equal(cookie.value, 'jeton-de-test')
  assert.equal(cookie.httpOnly, true)
  assert.equal(cookie.sameSite, 'Lax')
  assert.equal(cookie.path, '/')
  assert.equal(cookie.maxAge, 7 * 24 * 3600)
  assert.equal(cookie.secure, undefined)
})

test('en production le cookie posé porte l\'attribut Secure', async () => {
  const appProd = buildApp({ db, nodeEnv: 'production' })
  appProd.register(async (instance) => {
    instance.get('/api/_pose-cookie', async (request, reply) => {
      instance.poserCookieSession(reply, 'jeton-de-test')
      return { ok: true }
    })
  })
  const res = await appProd.inject({ method: 'GET', url: '/api/_pose-cookie' })
  assert.equal(res.cookies.find((c) => c.name === 'sid').secure, true)
  await appProd.close()
})

test('effacerCookieSession expire le cookie sid', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/_efface-cookie' })
  const cookie = res.cookies.find((c) => c.name === 'sid')
  assert.equal(cookie.value, '')
  assert.ok(cookie.expires.getTime() <= Date.now())
})
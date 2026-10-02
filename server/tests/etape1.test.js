import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { getTestDb, resetDb } from './helpers.js'

let db
let app

before(async () => {
  db = await getTestDb()
  app = buildApp({ db, nodeEnv: 'test' })
})

beforeEach(async () => {
  await resetDb(db)
})

after(async () => {
  if (app) await app.close()
  if (db) await db.end()
})

test('GET /api/health répond 200 sans révéler le contenu de la base', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { status: 'ok' })
})

test('une route inconnue répond 404 au format JSON attendu', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/nimportequoi' })
  assert.equal(res.statusCode, 404)
  assert.equal(res.json().error.code, 'NOT_FOUND')
})

test('une exception inattendue répond 500 sans fuiter le détail interne', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/_boom' })
  assert.equal(res.statusCode, 500)
  const body = res.json()
  assert.equal(body.error.code, 'INTERNAL_ERROR')
  assert.ok(!JSON.stringify(body).includes('boom'))
})

test('un corps invalide selon le schéma répond 400 avec le détail du champ', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/_echo', payload: {} })
  assert.equal(res.statusCode, 400)
  const body = res.json()
  assert.equal(body.error.code, 'VALIDATION_ERROR')
  assert.ok(body.error.details.some((d) => d.field === 'nom'))
})

test('un corps valide selon le schéma est accepté', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/_echo', payload: { nom: 'Malyd' } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().nom, 'Malyd')
})

test('un JSON mal formé répond 400 au format du §5, sans code interne de Fastify', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/_echo',
    headers: { 'content-type': 'application/json' },
    payload: '{pas du json',
  })
  assert.equal(res.statusCode, 400)
  const body = res.json()
  assert.equal(body.error.code, 'VALIDATION_ERROR')
  assert.ok(!JSON.stringify(body).includes('FST_'))
})
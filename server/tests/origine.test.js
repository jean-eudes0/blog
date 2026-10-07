import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { getTestDb } from './helpers.js'

let db
let app

before(async () => {
  db = await getTestDb()
  app = buildApp({ db, nodeEnv: 'test', publicUrl: 'https://blog.exemple.com' })
})

after(async () => {
  if (app) await app.close()
  if (db) await db.end()
})

const OK = 'https://blog.exemple.com'

function poster(headers = {}) {
  return app.inject({ method: 'POST', url: '/api/_echo', headers, payload: { nom: 'x' } })
}

test('sans Origin ni Referer (curl, scripts), la requête est acceptée', async () => {
  assert.equal((await poster()).statusCode, 200)
})

test('une requête venant de notre origine est acceptée', async () => {
  assert.equal((await poster({ origin: OK })).statusCode, 200)
})

test('une origine étrangère est refusée en 403 FORBIDDEN, au format du §5', async () => {
  const res = await poster({ origin: 'https://evil.example' })
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().error.code, 'FORBIDDEN')
})

test('Origin: null (contexte isolé) est refusé', async () => {
  assert.equal((await poster({ origin: 'null' })).statusCode, 403)
})

test('un domaine qui COMMENCE par le nôtre est refusé (comparaison exacte, pas "startsWith")', async () => {
  assert.equal((await poster({ origin: 'https://blog.exemple.com.evil.example' })).statusCode, 403)
})

test('http au lieu de https, ou un autre port, est refusé', async () => {
  assert.equal((await poster({ origin: 'http://blog.exemple.com' })).statusCode, 403)
  assert.equal((await poster({ origin: 'https://blog.exemple.com:8443' })).statusCode, 403)
})

test('sans Origin, un Referer étranger est refusé et un Referer de chez nous est accepté', async () => {
  assert.equal((await poster({ referer: 'https://evil.example/page' })).statusCode, 403)
  assert.equal((await poster({ referer: `${OK}/articles/mon-slug` })).statusCode, 200)
})

test('un Referer illisible est refusé', async () => {
  assert.equal((await poster({ referer: 'pas une url' })).statusCode, 403)
})

test('quand Origin est présent, c\'est lui qui décide (un Referer étranger ne change rien)', async () => {
  assert.equal((await poster({ origin: OK, referer: 'https://evil.example/' })).statusCode, 200)
})

test('les requêtes de lecture (GET) ne sont pas contrôlées', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://evil.example' } })
  assert.equal(res.statusCode, 200)
})

test('PATCH et DELETE sont contrôlés comme POST (403 avant même de chercher la route)', async () => {
  for (const method of ['PATCH', 'PUT', 'DELETE']) {
    const refuse = await app.inject({ method, url: '/api/inconnue', headers: { origin: 'https://evil.example' } })
    assert.equal(refuse.statusCode, 403, method)
    const accepte = await app.inject({ method, url: '/api/inconnue', headers: { origin: OK } })
    assert.equal(accepte.statusCode, 404, method)
  }
})

test('la connexion et la déconnexion sont protégées', async () => {
  const mauvais = { origin: 'https://evil.example' }
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: mauvais,
    payload: { email: 'moi@exemple.com', password: 'un-bon-mot-de-passe' },
  })
  assert.equal(login.statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: mauvais })).statusCode, 403)
})

test('un PUBLIC_URL avec chemin ou barre finale donne la même origine attendue', async () => {
  const autre = buildApp({ db, nodeEnv: 'test', publicUrl: 'https://blog.exemple.com/mon/blog/' })
  const res = await autre.inject({
    method: 'POST', url: '/api/_echo', headers: { origin: OK }, payload: { nom: 'x' },
  })
  assert.equal(res.statusCode, 200)
  await autre.close()
})
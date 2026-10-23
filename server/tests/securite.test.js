import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getTestDb, resetDb } from './helpers.js'
import { buildApp } from '../src/app.js'

let racine
let db
let app // développement / test, avec le client
let appProd // production, avec le client
let appApi // API seule

// Découpe l'en-tête CSP en { 'script-src': ["'self'"], ... }.
function lireCsp(res) {
  const csp = res.headers['content-security-policy']
  assert.ok(csp, 'en-tête Content-Security-Policy absent')
  const directives = {}
  for (const morceau of csp.split(';')) {
    const [nom, ...valeurs] = morceau.trim().split(/\s+/)
    if (nom) directives[nom] = valeurs
  }
  return directives
}

before(async () => {
  racine = mkdtempSync(path.join(tmpdir(), 'blog-securite-'))
  const clientDir = path.join(racine, 'dist')
  mkdirSync(clientDir, { recursive: true })
  writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><div id="root"></div>')

  db = await getTestDb()
  await resetDb(db)
  app = buildApp({ db, nodeEnv: 'test', clientDir })
  appProd = buildApp({ db, nodeEnv: 'production', publicUrl: 'https://exemple.test', clientDir })
  appApi = buildApp({ db, nodeEnv: 'test' })
  await Promise.all([app.ready(), appProd.ready(), appApi.ready()])
})

after(async () => {
  for (const instance of [app, appProd, appApi]) if (instance) await instance.close()
  if (db) await db.end()
  if (racine) rmSync(racine, { recursive: true, force: true })
})

test('la politique CSP n\'autorise que notre propre site pour les scripts, objets, cadres et formulaires', async () => {
  const csp = lireCsp(await app.inject({ method: 'GET', url: '/' }))
  assert.deepEqual(csp['default-src'], ["'self'"])
  assert.deepEqual(csp['script-src'], ["'self'"])
  assert.deepEqual(csp['style-src'], ["'self'"])
  assert.deepEqual(csp['connect-src'], ["'self'"])
  assert.deepEqual(csp['object-src'], ["'none'"])
  assert.deepEqual(csp['base-uri'], ["'self'"])
  assert.deepEqual(csp['form-action'], ["'self'"])
  assert.deepEqual(csp['frame-ancestors'], ["'none'"])
})

test('la CSP n\'ouvre jamais la porte aux scripts en ligne ni à eval', async () => {
  const brut = (await app.inject({ method: 'GET', url: '/' })).headers['content-security-policy']
  assert.ok(!brut.includes('unsafe-inline'), 'unsafe-inline interdit')
  assert.ok(!brut.includes('unsafe-eval'), 'unsafe-eval interdit')
  assert.ok(!/\s\*[\s;]|\s\*$/.test(brut), 'aucun joker * autorisé')
})

test('les images peuvent venir de notre site, de n\'importe quel https et de data:, mais pas de http:', async () => {
  const csp = lireCsp(await app.inject({ method: 'GET', url: '/' }))
  assert.deepEqual(csp['img-src'], ["'self'", 'https:', 'data:'])
})

test('les mêmes en-têtes de sécurité accompagnent les pages, l\'API, les erreurs 401 et les 404', async () => {
  for (const url of ['/', '/articles/mon-slug', '/api/health', '/api/admin/articles', '/api/inconnu']) {
    const res = await app.inject({ method: 'GET', url })
    assert.ok(res.headers['content-security-policy'], `${url} : CSP absente`)
    assert.equal(res.headers['x-content-type-options'], 'nosniff', url)
    assert.equal(res.headers['referrer-policy'], 'no-referrer', url)
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN', url)
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin', url)
    assert.equal(res.headers['x-powered-by'], undefined, url)
  }
})

test('en-têtes présents aussi quand le serveur ne sert que l\'API', async () => {
  const res = await appApi.inject({ method: 'GET', url: '/api/health' })
  assert.ok(res.headers['content-security-policy'])
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
})

test('hors production : ni HSTS ni upgrade-insecure-requests (ils casseraient le développement en http)', async () => {
  const res = await app.inject({ method: 'GET', url: '/' })
  assert.equal(res.headers['strict-transport-security'], undefined)
  assert.ok(!('upgrade-insecure-requests' in lireCsp(res)))
})

test('en production : HSTS pour un an et upgrade-insecure-requests', async () => {
  const res = await appProd.inject({ method: 'GET', url: '/' })
  assert.match(res.headers['strict-transport-security'], /^max-age=31536000/)
  assert.ok('upgrade-insecure-requests' in lireCsp(res))
  assert.deepEqual(lireCsp(res)['script-src'], ["'self'"])
})

test('COEP n\'est pas activé : il bloquerait les images de couverture hébergées ailleurs', async () => {
  const res = await app.inject({ method: 'GET', url: '/' })
  assert.equal(res.headers['cross-origin-embedder-policy'], undefined)
})

test('les en-têtes de cache du site sont conservés avec helmet', async () => {
  const res = await app.inject({ method: 'GET', url: '/' })
  assert.equal(res.headers['cache-control'], 'no-cache')
})
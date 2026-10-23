import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getTestDb, resetDb } from './helpers.js'
import { buildApp } from '../src/app.js'

const INDEX = '<!doctype html><html><body><div id="root"></div></body></html>'
const SECRET = 'CONTENU-QUI-NE-DOIT-JAMAIS-SORTIR'

let racine
let db
let app // avec le client
let appSansClient // API seule

before(async () => {
  // Un faux build : tests rapides, indépendants du vrai client/dist.
  racine = mkdtempSync(path.join(tmpdir(), 'blog-client-'))
  const clientDir = path.join(racine, 'dist')
  mkdirSync(path.join(clientDir, 'assets'), { recursive: true })
  writeFileSync(path.join(clientDir, 'index.html'), INDEX)
  writeFileSync(path.join(clientDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(path.join(clientDir, 'assets', 'index-abc123.js'), 'console.log("ok")')
  writeFileSync(path.join(clientDir, '.cache-secret'), SECRET) // fichier caché dans dist
  writeFileSync(path.join(racine, 'secret.txt'), SECRET) // EN DEHORS de dist

  db = await getTestDb()
  await resetDb(db)
  app = buildApp({ db, nodeEnv: 'test', clientDir })
  appSansClient = buildApp({ db, nodeEnv: 'test' })
  await app.ready()
  await appSansClient.ready()
})

after(async () => {
  if (app) await app.close()
  if (appSansClient) await appSansClient.close()
  if (db) await db.end()
  if (racine) rmSync(racine, { recursive: true, force: true })
})

test('la page d\'accueil est index.html', async () => {
  const res = await app.inject({ method: 'GET', url: '/' })
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'], /text\/html/)
  assert.equal(res.body, INDEX)
})

test('les routes de React Router renvoient index.html avec un statut 200 (actualiser la page marche)', async () => {
  for (const url of ['/articles/mon-slug', '/admin', '/admin/articles/12', '/connexion', '/une-page-qui-n-existe-pas', '/articles/mon-slug?page=2']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 200, url)
    assert.equal(res.body, INDEX, url)
  }
  const head = await app.inject({ method: 'HEAD', url: '/articles/mon-slug' })
  assert.equal(head.statusCode, 200)
})

test('index.html n\'est jamais gardé sans revalidation, les fichiers /assets/ le sont un an', async () => {
  const index = await app.inject({ method: 'GET', url: '/' })
  assert.equal(index.headers['cache-control'], 'no-cache')
  const fallback = await app.inject({ method: 'GET', url: '/articles/mon-slug' })
  assert.equal(fallback.headers['cache-control'], 'no-cache')

  const js = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' })
  assert.equal(js.statusCode, 200)
  assert.match(js.headers['content-type'], /javascript/)
  assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable')

  const icone = await app.inject({ method: 'GET', url: '/favicon.svg' })
  assert.equal(icone.statusCode, 200)
  assert.equal(icone.headers['cache-control'], 'public, max-age=3600')
})

test('un fichier introuvable est une vraie 404, pas une page HTML', async () => {
  for (const url of ['/assets/inexistant.js', '/favicon.ico', '/robots.txt']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 404, url)
    assert.match(res.headers['content-type'], /application\/json/, url)
    assert.equal(res.json().error.code, 'NOT_FOUND')
  }
})

test('une route inconnue sous /api reste la 404 JSON, jamais index.html', async () => {
  for (const url of ['/api/nimportequoi', '/api', '/api/', '/api/articles/a/b/c']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 404, url)
    assert.equal(res.json().error.code, 'NOT_FOUND', url)
  }
})

test('seules les lectures reçoivent index.html : un POST ou DELETE sur une page est une 404 JSON', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const res = await app.inject({ method, url: '/articles/mon-slug' })
    assert.equal(res.statusCode, 404, method)
    assert.equal(res.json().error.code, 'NOT_FOUND', method)
  }
})

test('l\'API répond comme avant, à côté du site', async () => {
  const sante = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(sante.statusCode, 200)
  assert.deepEqual(sante.json(), { status: 'ok' })

  const liste = await app.inject({ method: 'GET', url: '/api/articles' })
  assert.equal(liste.statusCode, 200)
  assert.deepEqual(liste.json().data, [])

  const protegee = await app.inject({ method: 'GET', url: '/api/admin/articles' })
  assert.equal(protegee.statusCode, 401)
  assert.equal(protegee.json().error.code, 'UNAUTHENTICATED')
})

test('on ne peut pas sortir du dossier du client, ni lire un fichier caché', async () => {
  const urls = [
    '/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/assets/..%2f..%2fsecret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/.cache-secret',
    '/%2ecache-secret',
    '/assets/../.cache-secret',
  ]
  for (const url of urls) {
    const res = await app.inject({ method: 'GET', url })
    assert.ok(!res.body.includes(SECRET), `${url} a laissé sortir un fichier`)
  }
  // Un fichier caché demandé directement : 404, comme s'il n'existait pas.
  const cache = await app.inject({ method: 'GET', url: '/.cache-secret' })
  assert.equal(cache.statusCode, 404)
  assert.equal(cache.json().error.code, 'NOT_FOUND')
})

test('un dossier ou un chemin mal formé donne une erreur JSON au format du §5, jamais le contenu du disque', async () => {
  for (const url of ['/assets/', '//', '/%00']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 403, url)
    assert.equal(res.json().error.code, 'FORBIDDEN', url)
  }
  // Sans barre finale, « /assets » est une page comme une autre pour React Router.
  const sansBarre = await app.inject({ method: 'GET', url: '/assets' })
  assert.equal(sansBarre.statusCode, 200)
  assert.equal(sansBarre.body, INDEX)
})

test('sans dossier de client, le serveur ne sert que l\'API : une page inconnue est la 404 JSON', async () => {
  const res = await appSansClient.inject({ method: 'GET', url: '/articles/mon-slug' })
  assert.equal(res.statusCode, 404)
  assert.equal(res.json().error.code, 'NOT_FOUND')

  const racineSite = await appSansClient.inject({ method: 'GET', url: '/' })
  assert.equal(racineSite.statusCode, 404)
})
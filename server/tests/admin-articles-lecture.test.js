import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { getTestDb, resetDb } from './helpers.js'
import { buildApp } from '../src/app.js'
import { creerAdmin } from '../src/lib/users.js'
import { creerSession, NOM_COOKIE } from '../src/lib/sessions.js'

let db
let app

before(async () => {
  db = await getTestDb()
  app = buildApp({ db, nodeEnv: 'test' })
  await app.ready()
})

beforeEach(async () => {
  await resetDb(db)
})

after(async () => {
  if (app) await app.close()
  if (db) await db.end()
})

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// Crée un admin et une session valide, renvoie l'en-tête Cookie à joindre aux requêtes.
async function connecter() {
  const admin = await creerAdmin(db, 'admin@exemple.com', 'un-bon-mot-de-passe', { cout: 4 })
  const jeton = await creerSession(db, admin.id)
  return { admin, cookie: `${NOM_COOKIE}=${jeton}` }
}

function lister(requete, headers = {}) {
  return app.inject({ method: 'GET', url: `/api/admin/articles${requete}`, headers })
}

function lire(id, headers = {}) {
  return app.inject({ method: 'GET', url: `/api/admin/articles/${id}`, headers })
}

async function creer(cookie, corps) {
  const res = await app.inject({ method: 'POST', url: '/api/admin/articles', headers: { cookie }, payload: corps })
  assert.equal(res.statusCode, 201)
  return res.json()
}

// Trois articles aux dates maîtrisées : b (publié) > c (brouillon) > a (brouillon, avec tags).
async function jeuDeTroisArticles(cookie) {
  const a = await creer(cookie, { title: 'A', contentMd: '# a', tags: ['React', 'Node.js'] })
  const b = await creer(cookie, { title: 'B', contentMd: '# b' })
  const c = await creer(cookie, { title: 'C', contentMd: '# c' })

  await db.query(`UPDATE articles SET updated_at = '2026-01-01T00:00:00Z' WHERE id = $1`, [a.id])
  await db.query(
    `UPDATE articles SET status = 'published', published_at = '2026-02-15T00:00:00Z', updated_at = '2026-03-01T00:00:00Z' WHERE id = $1`,
    [b.id]
  )
  await db.query(`UPDATE articles SET updated_at = '2026-02-01T00:00:00Z' WHERE id = $1`, [c.id])
  return { a, b, c }
}

test('les deux routes de lecture admin répondent 401 sans session', async () => {
  const liste = await lister('')
  assert.equal(liste.statusCode, 401)
  assert.equal(liste.json().error.code, 'UNAUTHENTICATED')

  const detail = await lire(1)
  assert.equal(detail.statusCode, 401)
  assert.equal(detail.json().error.code, 'UNAUTHENTICATED')

  const faux = await lister('', { cookie: `${NOM_COOKIE}=jeton-inconnu` })
  assert.equal(faux.statusCode, 401)
})

test('une requête invalide sans session répond 401, pas 400 (la session est vérifiée d\'abord)', async () => {
  const res = await lister('?page=0')
  assert.equal(res.statusCode, 401)
})

test('GET /api/admin/articles liste brouillons et publiés, du plus récemment modifié au plus ancien', async () => {
  const { cookie } = await connecter()
  await jeuDeTroisArticles(cookie)

  const res = await lister('', { cookie })
  assert.equal(res.statusCode, 200)
  const { data, meta } = res.json()

  assert.deepEqual(data.map((x) => x.slug), ['b', 'c', 'a'])
  assert.deepEqual(data.map((x) => x.status), ['published', 'draft', 'draft'])
  assert.deepEqual(meta, { page: 1, limit: 10, total: 3, totalPages: 1 })
})

test('la liste admin n\'expose que les champs prévus, avec les tags et des dates ISO', async () => {
  const { cookie } = await connecter()
  await jeuDeTroisArticles(cookie)

  const { data } = (await lister('', { cookie })).json()
  for (const article of data) {
    assert.deepEqual(Object.keys(article).sort(), ['id', 'publishedAt', 'slug', 'status', 'tags', 'title', 'updatedAt'])
    assert.match(article.updatedAt, ISO)
  }

  const publie = data.find((x) => x.slug === 'b')
  const brouillon = data.find((x) => x.slug === 'c')
  assert.match(publie.publishedAt, ISO)
  assert.equal(brouillon.publishedAt, null)

  const avecTags = data.find((x) => x.slug === 'a')
  assert.deepEqual(avecTags.tags, [
    { name: 'Node.js', slug: 'node-js' },
    { name: 'React', slug: 'react' },
  ])
  assert.deepEqual(brouillon.tags, [])
})

test('le filtre status ne garde que les brouillons ou que les publiés', async () => {
  const { cookie } = await connecter()
  await jeuDeTroisArticles(cookie)

  const publies = (await lister('?status=published', { cookie })).json()
  assert.deepEqual(publies.data.map((x) => x.slug), ['b'])
  assert.equal(publies.meta.total, 1)

  const brouillons = (await lister('?status=draft', { cookie })).json()
  assert.deepEqual(brouillons.data.map((x) => x.slug), ['c', 'a'])
  assert.equal(brouillons.meta.total, 2)
})

test('la liste admin pagine correctement', async () => {
  const { cookie } = await connecter()
  await jeuDeTroisArticles(cookie)

  const page1 = (await lister('?limit=2&page=1', { cookie })).json()
  assert.deepEqual(page1.data.map((x) => x.slug), ['b', 'c'])
  assert.deepEqual(page1.meta, { page: 1, limit: 2, total: 3, totalPages: 2 })

  const page2 = (await lister('?limit=2&page=2', { cookie })).json()
  assert.deepEqual(page2.data.map((x) => x.slug), ['a'])

  const trop = await lister('?limit=2&page=9', { cookie })
  assert.equal(trop.statusCode, 200)
  assert.deepEqual(trop.json().data, [])
})

test('la liste admin vide renvoie 200 et totalPages 1', async () => {
  const { cookie } = await connecter()
  const res = await lister('', { cookie })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } })
})

test('la liste admin refuse les paramètres invalides ou inconnus (400)', async () => {
  const { cookie } = await connecter()
  const mauvais = ['?page=0', '?page=abc', '?page=100001', '?limit=0', '?limit=51', '?limit=abc', '?status=archive', '?inconnu=1']
  for (const requete of mauvais) {
    const res = await lister(requete, { cookie })
    assert.equal(res.statusCode, 400, requete)
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  }
})

test('GET /api/admin/articles/:id renvoie l\'article complet, brouillon compris', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, {
    title: 'Mon Déclic',
    contentMd: '# Salut',
    excerpt: 'Un extrait',
    coverUrl: 'https://exemple.com/image.jpg',
    tags: ['React'],
  })

  const res = await lire(cree.id, { cookie })
  assert.equal(res.statusCode, 200)
  const article = res.json()

  assert.equal(article.id, cree.id)
  assert.equal(article.slug, 'mon-declic')
  assert.equal(article.status, 'draft')
  assert.equal(article.contentMd, '# Salut')
  assert.equal(article.excerpt, 'Un extrait')
  assert.equal(article.coverUrl, 'https://exemple.com/image.jpg')
  assert.equal(article.publishedAt, null)
  assert.match(article.createdAt, ISO)
  assert.match(article.updatedAt, ISO)
  assert.equal(article.readingTime, 1)
  assert.deepEqual(article.tags, [{ name: 'React', slug: 'react' }])
  assert.equal('authorId' in article, false)
  assert.equal('author_id' in article, false)
})

test('GET /api/admin/articles/:id sur un article publié renvoie sa date de publication', async () => {
  const { cookie } = await connecter()
  const { b } = await jeuDeTroisArticles(cookie)

  const article = (await lire(b.id, { cookie })).json()
  assert.equal(article.status, 'published')
  assert.match(article.publishedAt, ISO)
})

test('GET /api/admin/articles/:id inconnu : 404 NOT_FOUND au format du §5', async () => {
  const { cookie } = await connecter()
  const res = await lire(9999, { cookie })
  assert.equal(res.statusCode, 404)
  assert.equal(res.json().error.code, 'NOT_FOUND')
})

test('GET /api/admin/articles/:id avec un identifiant invalide ou démesuré : 400, pas 500', async () => {
  const { cookie } = await connecter()
  for (const id of ['abc', '0', '-1', '2147483648', '99999999999999999999']) {
    const res = await lire(id, { cookie })
    assert.equal(res.statusCode, 400, id)
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  }
})
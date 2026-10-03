import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { getTestDb, resetDb } from './helpers.js'

let db
let app
let authorId

const MS_PAR_JOUR = 86_400_000

before(async () => {
  db = await getTestDb()
  app = buildApp({ db, nodeEnv: 'test' })
})

beforeEach(async () => {
  await resetDb(db)
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash) VALUES ('auteur@exemple.com', 'h') RETURNING id`
  )
  authorId = rows[0].id
})

after(async () => {
  if (app) await app.close()
  if (db) await db.end()
})

async function creerArticle({
  slug,
  title = slug,
  status = 'published',
  joursDepuisPublication = 0,
  tags = [],
  contentMd = 'contenu',
}) {
  const publishedAt =
    status === 'published' ? new Date(Date.now() - joursDepuisPublication * MS_PAR_JOUR) : null
  const { rows } = await db.query(
    `INSERT INTO articles (title, slug, content_md, status, published_at, author_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [title, slug, contentMd, status, publishedAt, authorId]
  )
  const articleId = rows[0].id
  for (const nomTag of tags) {
    const { rows: tagRows } = await db.query(
      `INSERT INTO tags (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
      [nomTag, nomTag.toLowerCase()]
    )
    await db.query('INSERT INTO article_tags (article_id, tag_id) VALUES ($1, $2)', [articleId, tagRows[0].id])
  }
  return articleId
}

test('GET /api/articles renvoie une liste vide quand il n\'y a aucun article', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/articles' })
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.deepEqual(body.data, [])
  assert.deepEqual(body.meta, { page: 1, limit: 10, total: 0, totalPages: 1 })
})

test('GET /api/articles ne renvoie que les articles publiés, triés du plus récent au plus ancien', async () => {
  await creerArticle({ slug: 'ancien', joursDepuisPublication: 5 })
  await creerArticle({ slug: 'recent', joursDepuisPublication: 1 })
  await creerArticle({ slug: 'brouillon', status: 'draft' })

  const res = await app.inject({ method: 'GET', url: '/api/articles' })
  const body = res.json()
  assert.equal(body.meta.total, 2)
  assert.deepEqual(body.data.map((a) => a.slug), ['recent', 'ancien'])
})

test('GET /api/articles pagine correctement', async () => {
  for (let i = 1; i <= 15; i++) {
    await creerArticle({ slug: `article-${i}`, joursDepuisPublication: i })
  }

  const page1 = (await app.inject({ method: 'GET', url: '/api/articles?page=1&limit=10' })).json()
  assert.equal(page1.data.length, 10)
  assert.equal(page1.meta.total, 15)
  assert.equal(page1.meta.totalPages, 2)
  assert.equal(page1.data[0].slug, 'article-1')

  const page2 = (await app.inject({ method: 'GET', url: '/api/articles?page=2&limit=10' })).json()
  assert.equal(page2.data.length, 5)
})

test('GET /api/articles au-delà de la dernière page renvoie 200 avec une liste vide', async () => {
  await creerArticle({ slug: 'seul-article' })
  const res = await app.inject({ method: 'GET', url: '/api/articles?page=5&limit=10' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json().data, [])
})

for (const query of ['page=0', 'limit=0', 'limit=51', 'limit=abc', 'page=abc']) {
  test(`GET /api/articles?${query} renvoie 400`, async () => {
    const res = await app.inject({ method: 'GET', url: `/api/articles?${query}` })
    assert.equal(res.statusCode, 400)
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  })
}

test('GET /api/articles avec un paramètre inconnu renvoie 400 (pas ignoré en silence)', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/articles?foo=1' })
  assert.equal(res.statusCode, 400)
  assert.equal(res.json().error.code, 'VALIDATION_ERROR')
})

test('GET /api/articles ne renvoie pas le contenu complet (contentMd absent de la liste)', async () => {
  await creerArticle({ slug: 'test-contenu', contentMd: 'x'.repeat(5000) })
  const res = await app.inject({ method: 'GET', url: '/api/articles' })
  assert.equal(res.json().data[0].contentMd, undefined)
})

test('GET /api/articles inclut les tags de chaque article', async () => {
  await creerArticle({ slug: 'avec-tags', tags: ['fastify', 'tests'] })
  const res = await app.inject({ method: 'GET', url: '/api/articles' })
  const tags = res.json().data[0].tags.map((t) => t.slug).sort()
  assert.deepEqual(tags, ['fastify', 'tests'])
})

test('GET /api/articles/:slug renvoie un article publié avec son contenu', async () => {
  await creerArticle({ slug: 'mon-article', title: 'Mon article', contentMd: '# Bonjour' })
  const res = await app.inject({ method: 'GET', url: '/api/articles/mon-article' })
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.equal(body.title, 'Mon article')
  assert.equal(body.contentMd, '# Bonjour')
})

test('l\'id interne n\'est jamais exposé (liste et détail)', async () => {
  await creerArticle({ slug: 'sans-id' })
  const liste = (await app.inject({ method: 'GET', url: '/api/articles' })).json()
  const detail = (await app.inject({ method: 'GET', url: '/api/articles/sans-id' })).json()
  assert.equal(liste.data[0].id, undefined)
  assert.equal(detail.id, undefined)
})

test('GET /api/articles/:slug sur un brouillon renvoie 404 (pas 403, pas d\'indice que ça existe)', async () => {
  await creerArticle({ slug: 'brouillon-cache', status: 'draft' })
  const res = await app.inject({ method: 'GET', url: '/api/articles/brouillon-cache' })
  assert.equal(res.statusCode, 404)
  assert.equal(res.json().error.code, 'NOT_FOUND')
})

test('un brouillon et un slug inexistant renvoient exactement la même réponse', async () => {
  await creerArticle({ slug: 'brouillon-cache', status: 'draft' })
  const brouillon = await app.inject({ method: 'GET', url: '/api/articles/brouillon-cache' })
  const inconnu = await app.inject({ method: 'GET', url: '/api/articles/ca-n-existe-pas' })
  assert.equal(brouillon.statusCode, inconnu.statusCode)
  assert.deepEqual(brouillon.json(), inconnu.json())
})

test('GET /api/tags ne compte que les articles publiés', async () => {
  await creerArticle({ slug: 'pub-1', tags: ['fastify'] })
  await creerArticle({ slug: 'pub-2', tags: ['fastify'] })
  await creerArticle({ slug: 'brouillon-tag', status: 'draft', tags: ['secret'] })

  const res = await app.inject({ method: 'GET', url: '/api/tags' })
  const body = res.json()
  const fastify = body.data.find((t) => t.slug === 'fastify')
  assert.equal(fastify.articleCount, 2)
  assert.equal(body.data.find((t) => t.slug === 'secret'), undefined)
})

test('GET /api/articles avec une page démesurée renvoie 400, pas 500', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/articles?page=99999999999999999999' })
  assert.equal(res.statusCode, 400)
  assert.equal(res.json().error.code, 'VALIDATION_ERROR')
})

test('un slug démesuré répond au format du §5, sans code interne de Fastify', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/articles/' + 'a'.repeat(100000) })
  assert.equal(res.statusCode, 414)
  const body = res.json()
  assert.equal(body.error.code, 'VALIDATION_ERROR')
  assert.ok(!JSON.stringify(body).includes('FST_'))
})

test('un paramètre inconnu est nommé dans le détail de l\'erreur', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/articles?foo=1' })
  assert.equal(res.statusCode, 400)
  assert.ok(res.json().error.details.some((d) => d.field === 'foo'))
})
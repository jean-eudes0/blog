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

// Crée un admin et une session valide, renvoie l'en-tête Cookie à joindre aux requêtes.
async function connecter() {
  const admin = await creerAdmin(db, 'admin@exemple.com', 'un-bon-mot-de-passe', { cout: 4 })
  const jeton = await creerSession(db, admin.id)
  return { admin, cookie: `${NOM_COOKIE}=${jeton}` }
}

function creer(corps, headers = {}) {
  return app.inject({ method: 'POST', url: '/api/admin/articles', headers, payload: corps })
}

async function compter(table) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table}`)
  return rows[0].n
}

test('POST /api/admin/articles sans session : 401 et rien n\'est écrit', async () => {
  const res = await creer({ title: 'Titre', contentMd: '# a' })
  assert.equal(res.statusCode, 401)
  assert.equal(res.json().error.code, 'UNAUTHENTICATED')

  const faux = await creer({ title: 'Titre', contentMd: '# a' }, { cookie: `${NOM_COOKIE}=jeton-inconnu` })
  assert.equal(faux.statusCode, 401)
  assert.equal(await compter('articles'), 0)
})

test('POST /api/admin/articles refuse les données invalides et les champs interdits (400)', async () => {
  const { cookie } = await connecter()
  const mauvais = [
    {},
    { title: '   ', contentMd: '# a' },
    { title: 'x'.repeat(151), contentMd: '# a' },
    { title: 'Titre', contentMd: '' },
    { title: 'Titre', contentMd: '# a', slug: 'impose' },
    { title: 'Titre', contentMd: '# a', status: 'published' },
    { title: 'Titre', contentMd: '# a', coverUrl: 'javascript:alert(1)' },
    { title: 'Titre', contentMd: '# a', tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { title: 'Titre', contentMd: '# a', tags: ['x'.repeat(31)] },
  ]
  for (const corps of mauvais) {
    const res = await creer(corps, { cookie })
    assert.equal(res.statusCode, 400, JSON.stringify(corps))
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  }
  assert.equal(await compter('articles'), 0)
})

test('POST /api/admin/articles crée un brouillon avec son slug, ses tags et son auteur', async () => {
  const { admin, cookie } = await connecter()
  const res = await creer(
    { title: '  Mon Déclic ', contentMd: '# Salut', tags: ['React', 'react', 'Node.js'] },
    { cookie }
  )
  assert.equal(res.statusCode, 201)
  const article = res.json()

  assert.equal(article.title, 'Mon Déclic')
  assert.equal(article.slug, 'mon-declic')
  assert.equal(article.status, 'draft')
  assert.equal(article.publishedAt, null)
  assert.equal(article.excerpt, '')
  assert.equal(article.coverUrl, null)
  assert.equal(article.readingTime, 1)
  assert.deepEqual(article.tags, [
    { name: 'Node.js', slug: 'node-js' },
    { name: 'React', slug: 'react' },
  ])
  assert.equal(res.headers.location, `/api/admin/articles/${article.id}`)
  assert.equal('authorId' in article, false)

  const { rows } = await db.query('SELECT author_id FROM articles WHERE id = $1', [article.id])
  assert.equal(rows[0].author_id, admin.id)
})

test('un brouillon créé est invisible pour le public', async () => {
  const { cookie } = await connecter()
  await creer({ title: 'Mon Déclic', contentMd: '# Salut' }, { cookie })

  const detail = await app.inject({ method: 'GET', url: '/api/articles/mon-declic' })
  assert.equal(detail.statusCode, 404)
  const liste = await app.inject({ method: 'GET', url: '/api/articles' })
  assert.deepEqual(liste.json().data, [])
})

test('deux titres identiques donnent des slugs distincts (-2, -3)', async () => {
  const { cookie } = await connecter()
  const slugs = []
  for (const title of ['Déclic', 'Déclic', 'declic']) {
    const res = await creer({ title, contentMd: '# a' }, { cookie })
    assert.equal(res.statusCode, 201)
    slugs.push(res.json().slug)
  }
  assert.deepEqual(slugs, ['declic', 'declic-2', 'declic-3'])
})

test('un tag existant est réutilisé, pas dupliqué', async () => {
  const { cookie } = await connecter()
  await creer({ title: 'Un', contentMd: '# a', tags: ['react'] }, { cookie })
  await creer({ title: 'Deux', contentMd: '# a', tags: ['React'] }, { cookie })
  assert.equal(await compter('tags'), 1)
  assert.equal(await compter('article_tags'), 2)
})

test('POST /api/admin/articles refuse une requête venant d\'une autre origine (403)', async () => {
  const { cookie } = await connecter()
  const res = await creer({ title: 'Titre', contentMd: '# a' }, { cookie, origin: 'https://autre-site.example' })
  assert.equal(res.statusCode, 403)
  assert.equal(await compter('articles'), 0)
}) 
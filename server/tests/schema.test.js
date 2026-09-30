import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { getTestDb, resetDb } from './helpers.js'

let db

before(async () => {
  db = await getTestDb()
})

beforeEach(async () => {
  await resetDb(db)
  await db.query(`INSERT INTO users (email, password_hash) VALUES ('moi@exemple.com', 'hash-bidon')`)
  await db.query(`
    INSERT INTO articles (title, slug, content_md, status, published_at, author_id)
    VALUES ('Mon premier TP', 'mon-premier-tp', '# Bonjour', 'published', now(), 1)
  `)
  await db.query(`INSERT INTO tags (name, slug) VALUES ('fastify', 'fastify')`)
  await db.query(`INSERT INTO article_tags (article_id, tag_id) VALUES (1, 1)`)
})

after(async () => {
  await db.end()
})

const casRefuses = [
  ['auteur inexistant',
    `INSERT INTO articles (title, slug, content_md, author_id) VALUES ('t', 'a', 'c', 99)`, '23503'],
  ['slug en double',
    `INSERT INTO articles (title, slug, content_md, author_id) VALUES ('t', 'mon-premier-tp', 'c', 1)`, '23505'],
  ['email en double (casse différente)',
    `INSERT INTO users (email, password_hash) VALUES ('MOI@exemple.com', 'h')`, '23505'],
  ['slug avec majuscules',
    `INSERT INTO articles (title, slug, content_md, author_id) VALUES ('t', 'Mon-Slug', 'c', 1)`, '23514'],
  ['article publié sans date',
    `INSERT INTO articles (title, slug, content_md, status, author_id) VALUES ('t', 'b', 'c', 'published', 1)`, '23514'],
  ["suppression d'un utilisateur qui a des articles",
    `DELETE FROM users WHERE id = 1`, '23001'],
]

for (const [nom, sql, codeAttendu] of casRefuses) {
  test(`refuse : ${nom}`, async () => {
    await assert.rejects(() => db.query(sql), (err) => {
      assert.equal(err.code, codeAttendu, `attendu ${codeAttendu}, reçu ${err.code}: ${err.message}`)
      return true
    })
  })
}

test('supprimer un article supprime ses liens avec les tags', async () => {
  await db.query('DELETE FROM articles WHERE id = 1')
  const { rows } = await db.query('SELECT count(*)::int AS n FROM article_tags')
  assert.equal(rows[0].n, 0)
})
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'

function preparer() {
  const db = openDb(':memory:')
  db.exec(`INSERT INTO users (email, password_hash) VALUES ('moi@exemple.com', 'hash-bidon')`)
  db.exec(`INSERT INTO articles (title, slug, content_md, status, published_at, author_id)
           VALUES ('Mon premier TP', 'mon-premier-tp', '# Bonjour', 'published', '2026-09-28T10:00:00Z', 1)`)
  db.exec(`INSERT INTO tags (name, slug) VALUES ('fastify', 'fastify')`)
  db.exec(`INSERT INTO article_tags (article_id, tag_id) VALUES (1, 1)`)
  return db
}

const casRefuses = [
  ['auteur inexistant',
    `INSERT INTO articles (title, slug, content_md, author_id) VALUES ('t', 'a', 'c', 99)`, /FOREIGN KEY/],
  ['slug en double',
    `INSERT INTO articles (title, slug, content_md, author_id) VALUES ('t', 'mon-premier-tp', 'c', 1)`, /UNIQUE/],
  ['email en double (casse différente)',
    `INSERT INTO users (email, password_hash) VALUES ('MOI@exemple.com', 'h')`, /UNIQUE/],
  ['slug avec majuscules',
    `INSERT INTO articles (title, slug, content_md, author_id) VALUES ('t', 'Mon-Slug', 'c', 1)`, /CHECK/],
  ['article publié sans date',
    `INSERT INTO articles (title, slug, content_md, status, author_id) VALUES ('t', 'b', 'c', 'published', 1)`, /CHECK/],
  ['suppression d\'un utilisateur qui a des articles',
    `DELETE FROM users WHERE id = 1`, /FOREIGN KEY/],
]

for (const [nom, sql, erreur] of casRefuses) {
  test(`refuse : ${nom}`, () => {
    const db = preparer()
    assert.throws(() => db.exec(sql), erreur)
  })
}

test('supprimer un article supprime ses liens avec les tags', () => {
  const db = preparer()
  db.exec('DELETE FROM articles WHERE id = 1')
  const { n } = db.prepare('SELECT count(*) AS n FROM article_tags').get()
  assert.equal(n, 0)
})
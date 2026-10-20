import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { getTestDb, resetDb } from './helpers.js'
import { creerAdmin } from '../src/lib/users.js'
import { creerSession } from '../src/lib/sessions.js'

// Créations et modifications en doublon ou simultanées : mêmes titres, mêmes tags.
// Ce sont des cas que les tests "une requête à la fois" ne voient jamais.

let db
let app
let adminId
let cookies

before(async () => {
  db = await getTestDb()
  app = buildApp({ db, nodeEnv: 'test' })
})

beforeEach(async () => {
  await resetDb(db)
  const admin = await creerAdmin(db, 'moi@exemple.com', 'un-bon-mot-de-passe', { cout: 4 })
  adminId = admin.id
  cookies = { sid: await creerSession(db, adminId) }
})

after(async () => {
  if (app) await app.close()
  if (db) await db.end()
})

const creer = (payload) => app.inject({ method: 'POST', url: '/api/admin/articles', payload, cookies })
const modifier = (id, payload) => app.inject({ method: 'PATCH', url: `/api/admin/articles/${id}`, payload, cookies })
const statuts = (reponses) => reponses.map((r) => r.statusCode)
const corps = (extra = {}) => ({ title: 'Notes de la semaine', contentMd: 'texte', ...extra })

async function inserer(slug) {
  await db.query(
    `INSERT INTO articles (title, slug, content_md, author_id) VALUES ($1, $1, 'x', $2)`,
    [slug, adminId]
  )
}

test('plus de 10 articles avec le même titre : aucun refus, slugs -2, -3, ... -13', async () => {
  const slugs = []
  for (let i = 0; i < 13; i++) {
    const res = await creer(corps())
    assert.equal(res.statusCode, 201, `création n°${i + 1}`)
    slugs.push(res.json().slug)
  }
  assert.deepEqual(slugs, ['notes-de-la-semaine', ...Array.from({ length: 12 }, (_, i) => `notes-de-la-semaine-${i + 2}`)])
})

test('un slug déjà pris n\'est jamais réutilisé, même avec des trous dans les suffixes', async () => {
  await inserer('trou')
  await inserer('trou-5')
  const res = await creer(corps({ title: 'Trou' }))
  assert.equal(res.statusCode, 201)
  assert.match(res.json().slug, /^trou-\d+$/)
  assert.notEqual(res.json().slug, 'trou-5')
})

test('un autre article dont le slug commence pareil ne perturbe pas le calcul du suffixe', async () => {
  await inserer('react-2')
  await inserer('react-native')
  assert.equal((await creer(corps({ title: 'React' }))).json().slug, 'react')
  assert.equal((await creer(corps({ title: 'React' }))).json().slug, 'react-3')
})

test('12 créations simultanées du même titre : toutes réussissent, slugs tous différents', async () => {
  const reponses = await Promise.all(Array.from({ length: 12 }, () => creer(corps({ tags: ['alpha', 'beta'] }))))
  assert.deepEqual(statuts(reponses), Array(12).fill(201))
  assert.equal(new Set(reponses.map((r) => r.json().slug)).size, 12)
})

test('créations simultanées avec les mêmes tags dans des ordres différents : aucun interblocage (pas de 500)', async () => {
  const sens = [['alpha', 'beta', 'gamma', 'delta'], ['delta', 'gamma', 'beta', 'alpha']]
  const reponses = await Promise.all(
    Array.from({ length: 60 }, (_, i) => creer(corps({ title: `Tags croisés ${i}`, tags: sens[i % 2] })))
  )
  assert.deepEqual(statuts(reponses), Array(60).fill(201))
  const { rows } = await db.query('SELECT count(*)::int AS n FROM tags')
  assert.equal(rows[0].n, 4)
})

test('modifications simultanées des tags dans des ordres différents : aucun interblocage (pas de 500)', async () => {
  const ids = []
  for (let i = 0; i < 30; i++) ids.push((await creer(corps({ title: `Article ${i}` }))).json().id)
  const sens = [['un', 'deux', 'trois', 'quatre'], ['quatre', 'trois', 'deux', 'un']]
  const reponses = await Promise.all(ids.map((id, i) => modifier(id, { tags: sens[i % 2] })))
  assert.deepEqual(statuts(reponses), Array(30).fill(200))
})
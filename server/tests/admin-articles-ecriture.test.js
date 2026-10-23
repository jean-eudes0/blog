import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { getTestDb, resetDb } from './helpers.js'
import { buildApp } from '../src/app.js'
import { creerAdmin } from '../src/lib/users.js'
import { creerSession, NOM_COOKIE } from '../src/lib/sessions.js'
import { modifierArticle } from '../src/lib/articles-admin.js'

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
const AUTRE_ORIGINE = 'https://autre-site.example'

// Crée un admin et une session valide, renvoie l'en-tête Cookie à joindre aux requêtes.
async function connecter() {
  const admin = await creerAdmin(db, 'admin@exemple.com', 'un-bon-mot-de-passe', { cout: 4 })
  const jeton = await creerSession(db, admin.id)
  return { admin, cookie: `${NOM_COOKIE}=${jeton}` }
}

function requete(method, url, { cookie, origin, payload } = {}) {
  const headers = {}
  if (cookie) headers.cookie = cookie
  if (origin) headers.origin = origin
  return app.inject({ method, url, headers, payload })
}

const modifier = (id, corps, opts) => requete('PATCH', `/api/admin/articles/${id}`, { ...opts, payload: corps })
const publier = (id, opts) => requete('POST', `/api/admin/articles/${id}/publish`, opts)
const depublier = (id, opts) => requete('POST', `/api/admin/articles/${id}/unpublish`, opts)
const supprimer = (id, opts) => requete('DELETE', `/api/admin/articles/${id}`, opts)

async function creer(cookie, corps) {
  const res = await requete('POST', '/api/admin/articles', { cookie, payload: corps })
  assert.equal(res.statusCode, 201)
  return res.json()
}

async function ligne(id) {
  const { rows } = await db.query('SELECT * FROM articles WHERE id = $1', [id])
  return rows[0]
}

async function compter(table) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table}`)
  return rows[0].n
}

// ---------- Accès : session et origine ----------

test('les quatre routes d\'écriture répondent 401 sans session, et rien n\'est modifié', async () => {
  const { cookie } = await connecter()
  const { id } = await creer(cookie, { title: 'Intact', contentMd: '# a' })

  const reponses = [
    await modifier(id, { title: 'Piraté' }),
    await modifier(id, {}), // invalide, mais la session est vérifiée d'abord
    await publier(id),
    await depublier(id),
    await supprimer(id),
  ]
  for (const res of reponses) {
    assert.equal(res.statusCode, 401)
    assert.equal(res.json().error.code, 'UNAUTHENTICATED')
  }

  const apres = await ligne(id)
  assert.equal(apres.title, 'Intact')
  assert.equal(apres.status, 'draft')
})

test('les quatre routes d\'écriture refusent une origine étrangère (403), sans rien modifier', async () => {
  const { cookie } = await connecter()
  const { id } = await creer(cookie, { title: 'Intact', contentMd: '# a' })
  const opts = { cookie, origin: AUTRE_ORIGINE }

  const reponses = [
    await modifier(id, { title: 'Piraté' }, opts),
    await publier(id, opts),
    await depublier(id, opts),
    await supprimer(id, opts),
  ]
  for (const res of reponses) assert.equal(res.statusCode, 403)

  const apres = await ligne(id)
  assert.equal(apres.title, 'Intact')
  assert.equal(apres.status, 'draft')
})

// ---------- Validation du texte ----------

test('un caractère NUL est refusé en 400 à la création, pas en 500', async () => {
  const { cookie } = await connecter()
  const mauvais = [
    { title: 'a\u0000b', contentMd: '# a' },
    { title: 'Titre', contentMd: 'x\u0000y' },
    { title: 'Titre', contentMd: '# a', excerpt: '\u0000' },
    { title: 'Titre', contentMd: '# a', tags: ['a\u0000b'] },
  ]
  for (const corps of mauvais) {
    const res = await requete('POST', '/api/admin/articles', { cookie, payload: corps })
    assert.equal(res.statusCode, 400)
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  }
  assert.equal(await compter('articles'), 0)
})

test('coverUrl : seul https:// est accepté (http://, javascript:, data:, ftp: et adresse sans protocole : 400)', async () => {
  const { cookie } = await connecter()
  for (const coverUrl of ['http://exemple.com/a.jpg', 'javascript:alert(1)', 'data:text/html,x', 'ftp://exemple.com/a.jpg', 'exemple.com/a.jpg']) {
    const res = await requete('POST', '/api/admin/articles', { cookie, payload: { title: 'T', contentMd: '# a', coverUrl } })
    assert.equal(res.statusCode, 400, coverUrl)
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  }
  assert.equal(await compter('articles'), 0)

  const ok = await requete('POST', '/api/admin/articles', { cookie, payload: { title: 'T', contentMd: '# a', coverUrl: 'https://exemple.com/a.jpg' } })
  assert.equal(ok.statusCode, 201)
  assert.equal(ok.json().coverUrl, 'https://exemple.com/a.jpg')
})

// ---------- PATCH ----------

test('PATCH ne modifie que les champs envoyés et met updated_at à jour', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, {
    title: 'Titre initial',
    contentMd: '# ancien',
    excerpt: 'Extrait',
    coverUrl: 'https://exemple.com/a.jpg',
    tags: ['react'],
  })
  await db.query(`UPDATE articles SET updated_at = '2026-01-01T00:00:00Z' WHERE id = $1`, [cree.id])

  const res = await modifier(cree.id, { contentMd: '# nouveau' }, { cookie })
  assert.equal(res.statusCode, 200)
  const article = res.json()

  assert.equal(article.contentMd, '# nouveau')
  assert.equal(article.title, 'Titre initial')
  assert.equal(article.excerpt, 'Extrait')
  assert.equal(article.coverUrl, 'https://exemple.com/a.jpg')
  assert.deepEqual(article.tags, [{ name: 'react', slug: 'react' }])
  assert.equal(article.status, 'draft')
  assert.match(article.updatedAt, ISO)
  assert.ok(new Date(article.updatedAt) > new Date('2026-01-01T00:00:00Z'))
})

test('PATCH ne change jamais le slug, même si le titre change', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Titre initial', contentMd: '# a' })

  const res = await modifier(cree.id, { title: '  Tout autre titre ' }, { cookie })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().title, 'Tout autre titre')
  assert.equal(res.json().slug, 'titre-initial')
})

test('PATCH peut enlever l\'image de couverture (null) et vider l\'extrait', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'T', contentMd: '# a', excerpt: 'Extrait', coverUrl: 'https://exemple.com/a.jpg' })

  const res = await modifier(cree.id, { coverUrl: null, excerpt: '' }, { cookie })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().coverUrl, null)
  assert.equal(res.json().excerpt, '')
})

test('PATCH remplace la liste complète des tags : anciens liens retirés, anciens tags conservés', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'T', contentMd: '# a', tags: ['react', 'node'] })

  const res = await modifier(cree.id, { tags: ['Vue'] }, { cookie })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json().tags, [{ name: 'Vue', slug: 'vue' }])
  assert.equal(await compter('article_tags'), 1)
  assert.equal(await compter('tags'), 3) // pas de CRUD de tags en V1 : les tags orphelins restent

  const vide = await modifier(cree.id, { tags: [] }, { cookie })
  assert.deepEqual(vide.json().tags, [])
  assert.equal(await compter('article_tags'), 0)
})

test('PATCH qui ne change que les tags met quand même updated_at à jour', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'T', contentMd: '# a' })
  await db.query(`UPDATE articles SET updated_at = '2026-01-01T00:00:00Z' WHERE id = $1`, [cree.id])

  const res = await modifier(cree.id, { tags: ['react'] }, { cookie })
  assert.ok(new Date(res.json().updatedAt) > new Date('2026-01-01T00:00:00Z'))
})

test('PATCH refuse un corps vide, les champs interdits et les valeurs invalides (400), sans rien modifier', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Intact', contentMd: '# a' })
  const mauvais = [
    {},
    { slug: 'impose' },
    { status: 'published' },
    { publishedAt: '2026-01-01T00:00:00Z' },
    { id: 99 },
    { authorId: 99 },
    { createdAt: '2026-01-01T00:00:00Z' },
    { title: '   ' },
    { title: 'x'.repeat(151) },
    { contentMd: '' },
    { coverUrl: 'javascript:alert(1)' },
    { tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { title: 'a\u0000b' },
    { coverUrl: 'http://exemple.com/a.jpg' },
  ]
  for (const corps of mauvais) {
    const res = await modifier(cree.id, corps, { cookie })
    assert.equal(res.statusCode, 400, JSON.stringify(corps))
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  }
  const apres = await ligne(cree.id)
  assert.equal(apres.title, 'Intact')
  assert.equal(apres.slug, 'intact')
  assert.equal(apres.status, 'draft')
})

test('PATCH sur un article inconnu : 404 ; sur un identifiant invalide : 400', async () => {
  const { cookie } = await connecter()
  const inconnu = await modifier(9999, { title: 'T' }, { cookie })
  assert.equal(inconnu.statusCode, 404)
  assert.equal(inconnu.json().error.code, 'NOT_FOUND')

  for (const id of ['abc', '0', '-1', '2147483648']) {
    const res = await modifier(id, { title: 'T' }, { cookie })
    assert.equal(res.statusCode, 400, id)
  }
})

test('modifier un article publié le laisse publié, garde son slug et sa date, et le public voit le changement', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Mon Déclic', contentMd: '# a' })
  const publie = (await publier(cree.id, { cookie })).json()

  const res = await modifier(cree.id, { title: 'Un titre corrigé' }, { cookie })
  const article = res.json()
  assert.equal(article.status, 'published')
  assert.equal(article.slug, 'mon-declic')
  assert.equal(article.publishedAt, publie.publishedAt)

  const public_ = await app.inject({ method: 'GET', url: '/api/articles/mon-declic' })
  assert.equal(public_.statusCode, 200)
  assert.equal(public_.json().title, 'Un titre corrigé')
})

test('une écriture qui échoue en cours de route est annulée en entier (transaction)', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Intact', contentMd: '# a', tags: ['react'] })

  // Une base dont l'insertion des tags tombe en panne, après que l'UPDATE a déjà réussi.
  const dbEnPanne = {
    connect: async () => {
      const client = await db.connect()
      return {
        query: (sql, valeurs) =>
          /INSERT INTO tags/.test(sql) ? Promise.reject(new Error('panne simulée')) : client.query(sql, valeurs),
        release: () => client.release(),
      }
    },
  }

  await assert.rejects(modifierArticle(dbEnPanne, cree.id, { title: 'Nouveau', tags: ['vue'] }), /panne simulée/)

  const apres = await ligne(cree.id)
  assert.equal(apres.title, 'Intact') // l'UPDATE du titre a été annulé
  const { rows } = await db.query('SELECT t.slug FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = $1', [cree.id])
  assert.deepEqual(rows.map((r) => r.slug), ['react']) // les anciens liens sont revenus
})

// ---------- publish / unpublish ----------

test('publish passe le brouillon en publié, avec une date, et le rend visible au public', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Mon Déclic', contentMd: '# a' })

  const res = await publier(cree.id, { cookie })
  assert.equal(res.statusCode, 200)
  const article = res.json()
  assert.equal(article.status, 'published')
  assert.match(article.publishedAt, ISO)

  const detail = await app.inject({ method: 'GET', url: '/api/articles/mon-declic' })
  assert.equal(detail.statusCode, 200)
  const liste = await app.inject({ method: 'GET', url: '/api/articles' })
  assert.deepEqual(liste.json().data.map((a) => a.slug), ['mon-declic'])
})

test('publish est idempotent : un second appel ne change ni la date ni updated_at', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'T', contentMd: '# a' })

  const premier = (await publier(cree.id, { cookie })).json()
  const second = await publier(cree.id, { cookie })
  assert.equal(second.statusCode, 200)
  assert.equal(second.json().publishedAt, premier.publishedAt)
  assert.equal(second.json().updatedAt, premier.updatedAt)
})

test('unpublish repasse en brouillon en gardant la date ; republier la conserve', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Mon Déclic', contentMd: '# a' })
  await publier(cree.id, { cookie })
  await db.query(`UPDATE articles SET published_at = '2026-01-15T00:00:00Z' WHERE id = $1`, [cree.id])

  const retire = await depublier(cree.id, { cookie })
  assert.equal(retire.statusCode, 200)
  assert.equal(retire.json().status, 'draft')
  assert.equal(retire.json().publishedAt, '2026-01-15T00:00:00.000Z')

  const invisible = await app.inject({ method: 'GET', url: '/api/articles/mon-declic' })
  assert.equal(invisible.statusCode, 404)

  const republie = await publier(cree.id, { cookie })
  assert.equal(republie.json().status, 'published')
  assert.equal(republie.json().publishedAt, '2026-01-15T00:00:00.000Z')
})

test('unpublish d\'un brouillon jamais publié : 200, toujours brouillon, sans date (idempotent)', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'T', contentMd: '# a' })

  const res = await depublier(cree.id, { cookie })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().status, 'draft')
  assert.equal(res.json().publishedAt, null)
  assert.equal(res.json().updatedAt, cree.updatedAt)
})

test('publish et unpublish : 404 sur un article inconnu, 400 sur un identifiant invalide', async () => {
  const { cookie } = await connecter()
  for (const action of [publier, depublier]) {
    const inconnu = await action(9999, { cookie })
    assert.equal(inconnu.statusCode, 404)
    assert.equal(inconnu.json().error.code, 'NOT_FOUND')

    for (const id of ['abc', '0', '2147483648']) {
      assert.equal((await action(id, { cookie })).statusCode, 400, id)
    }
  }
})

// ---------- DELETE ----------

test('DELETE renvoie 204 sans corps, supprime l\'article et ses liens, garde les tags', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Mon Déclic', contentMd: '# a', tags: ['react', 'node'] })

  const res = await supprimer(cree.id, { cookie })
  assert.equal(res.statusCode, 204)
  assert.equal(res.body, '')

  assert.equal(await compter('articles'), 0)
  assert.equal(await compter('article_tags'), 0)
  assert.equal(await compter('tags'), 2)
  assert.equal((await requete('GET', `/api/admin/articles/${cree.id}`, { cookie })).statusCode, 404)
})

test('un article publié supprimé disparaît du public', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'Mon Déclic', contentMd: '# a' })
  await publier(cree.id, { cookie })

  await supprimer(cree.id, { cookie })
  assert.equal((await app.inject({ method: 'GET', url: '/api/articles/mon-declic' })).statusCode, 404)
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/articles' })).json().data, [])
})

test('DELETE : 404 sur un article déjà supprimé ou inconnu, 400 sur un identifiant invalide', async () => {
  const { cookie } = await connecter()
  const cree = await creer(cookie, { title: 'T', contentMd: '# a' })
  assert.equal((await supprimer(cree.id, { cookie })).statusCode, 204)

  const encore = await supprimer(cree.id, { cookie })
  assert.equal(encore.statusCode, 404)
  assert.equal(encore.json().error.code, 'NOT_FOUND')

  for (const id of ['abc', '0', '2147483648']) {
    assert.equal((await supprimer(id, { cookie })).statusCode, 400, id)
  }
})
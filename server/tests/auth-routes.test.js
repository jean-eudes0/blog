import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { getTestDb, resetDb } from './helpers.js'
import { creerAdmin } from '../src/lib/users.js'
import { creerSession, trouverUtilisateur } from '../src/lib/sessions.js'

let db
let app

const EMAIL = 'moi@exemple.com'
const MDP = 'un-bon-mot-de-passe'
// Limite très haute : ces tests font bien plus de 5 connexions depuis la même IP.
const SANS_LIMITE = { max: 10_000, timeWindow: '1 minute' }

before(async () => {
  db = await getTestDb()
  app = buildApp({ db, nodeEnv: 'test', limiteLogin: SANS_LIMITE })
})

beforeEach(async () => {
  await resetDb(db)
  // Coût 4 : seulement pour accélérer les tests (la vraie valeur est 12).
  await creerAdmin(db, EMAIL, MDP, { cout: 4 })
})

after(async () => {
  if (app) await app.close()
  if (db) await db.end()
})

const login = (payload, opts = {}) =>
  (opts.app ?? app).inject({ method: 'POST', url: '/api/auth/login', payload, ...opts.inject })

const cookieSid = (res) => res.cookies.find((c) => c.name === 'sid')

// ---------- login : succès ----------

test('login valide : 200, l\'utilisateur, et un cookie de session sécurisé', async () => {
  const res = await login({ email: EMAIL, password: MDP })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { user: { id: res.json().user.id, email: EMAIL, role: 'admin' } })
  const c = cookieSid(res)
  assert.match(c.value, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(c.httpOnly, true)
  assert.equal(c.sameSite, 'Lax')
  assert.equal(c.path, '/')
  assert.equal(c.maxAge, 7 * 24 * 3600)
})

test('login ne renvoie jamais le hash du mot de passe', async () => {
  const res = await login({ email: EMAIL, password: MDP })
  assert.ok(!res.body.includes('password'))
  assert.ok(!res.body.includes('$2'))
})

test('login accepte l\'e-mail sans tenir compte de la casse ni des espaces autour', async () => {
  const res = await login({ email: 'MOI@Exemple.COM', password: MDP })
  assert.equal(res.statusCode, 200)
})

test('le cookie obtenu au login ouvre /api/auth/me', async () => {
  const res = await login({ email: EMAIL, password: MDP })
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: cookieSid(res).value } })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().user.email, EMAIL)
  assert.equal(me.json().user.password_hash, undefined)
})

test('chaque connexion crée une nouvelle session avec un jeton différent', async () => {
  const a = cookieSid(await login({ email: EMAIL, password: MDP })).value
  const b = cookieSid(await login({ email: EMAIL, password: MDP })).value
  assert.notEqual(a, b)
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  assert.equal(rows[0].n, 2)
})

test('se reconnecter avec un cookie existant révoque l\'ancienne session', async () => {
  const ancien = cookieSid(await login({ email: EMAIL, password: MDP })).value
  const res = await login({ email: EMAIL, password: MDP }, { inject: { cookies: { sid: ancien } } })
  const nouveau = cookieSid(res).value
  assert.equal(await trouverUtilisateur(db, ancien), null)
  assert.ok(await trouverUtilisateur(db, nouveau))
})

// ---------- login : échecs ----------

test('mauvais mot de passe : 401 INVALID_CREDENTIALS, sans cookie', async () => {
  const res = await login({ email: EMAIL, password: 'mauvais-mot-de-passe' })
  assert.equal(res.statusCode, 401)
  assert.equal(res.json().error.code, 'INVALID_CREDENTIALS')
  assert.equal(cookieSid(res), undefined)
})

test('e-mail inconnu et mauvais mot de passe renvoient exactement la même réponse', async () => {
  const mauvaisMdp = await login({ email: EMAIL, password: 'mauvais-mot-de-passe' })
  const inconnu = await login({ email: 'personne@exemple.com', password: 'mauvais-mot-de-passe' })
  assert.equal(inconnu.statusCode, mauvaisMdp.statusCode)
  assert.deepEqual(inconnu.json(), mauvaisMdp.json())
})

test('un échec ne crée aucune session', async () => {
  await login({ email: EMAIL, password: 'mauvais-mot-de-passe' })
  await login({ email: 'personne@exemple.com', password: MDP })
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  assert.equal(rows[0].n, 0)
})

test('un e-mail inconnu prend le temps d\'une vraie comparaison bcrypt (pas de fuite par le temps)', async () => {
  await login({ email: 'personne@exemple.com', password: MDP }) // amorce le hash factice
  const debut = performance.now()
  const res = await login({ email: 'personne@exemple.com', password: MDP })
  const duree = performance.now() - debut
  assert.equal(res.statusCode, 401)
  // Un bcrypt de coût 12 prend largement plus de 50 ms ; sans comparaison, la réponse serait quasi immédiate.
  assert.ok(duree > 50, `réponse trop rapide (${duree.toFixed(1)} ms) : la comparaison factice a-t-elle disparu ?`)
})

test('le compte de démonstration (faux hash) ne peut jamais se connecter, sans erreur serveur', async () => {
  await db.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('demo@exemple.local', 'DEMO_NE_PEUT_PAS_SERVIR_A_SE_CONNECTER', 'author')`
  )
  for (const password of ['DEMO_NE_PEUT_PAS_SERVIR_A_SE_CONNECTER', 'nimporte-quoi-12345', MDP]) {
    const res = await login({ email: 'demo@exemple.local', password })
    assert.equal(res.statusCode, 401)
    assert.equal(res.json().error.code, 'INVALID_CREDENTIALS')
  }
})

test('un mot de passe de plus de 72 octets est refusé même s\'il commence comme le vrai', async () => {
  const mdp72 = 'a'.repeat(72)
  await db.query('TRUNCATE users, sessions RESTART IDENTITY CASCADE')
  await creerAdmin(db, EMAIL, mdp72, { cout: 4 })
  assert.equal((await login({ email: EMAIL, password: mdp72 })).statusCode, 200)
  const res = await login({ email: EMAIL, password: mdp72 + 'b' })
  assert.equal(res.statusCode, 401)
})

// ---------- login : validation ----------

test('login avec des données invalides répond 400 VALIDATION_ERROR', async () => {
  const cas = [
    {},
    { email: EMAIL },
    { password: MDP },
    { email: 'pas-un-email', password: MDP },
    { email: EMAIL, password: '' },
    { email: EMAIL, password: 'x'.repeat(201) },
    { email: EMAIL, password: { a: 1 } },
    { email: 'a'.repeat(250) + '@exemple.com', password: MDP },
    { email: EMAIL, password: MDP, role: 'admin' },
  ]
  for (const payload of cas) {
    const res = await login(payload)
    assert.equal(res.statusCode, 400, JSON.stringify(payload).slice(0, 60))
    assert.equal(res.json().error.code, 'VALIDATION_ERROR')
  }
})

// ---------- logout ----------

test('logout : 204, cookie effacé, session supprimée en base', async () => {
  const jeton = cookieSid(await login({ email: EMAIL, password: MDP })).value
  const res = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: jeton } })
  assert.equal(res.statusCode, 204)
  assert.equal(res.body, '')
  assert.equal(cookieSid(res).value, '')
  assert.equal(await trouverUtilisateur(db, jeton), null)
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: jeton } })
  assert.equal(me.statusCode, 401)
})

test('logout est idempotent : 204 sans cookie, avec un jeton inconnu, ou répété', async () => {
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode, 204)
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: 'inconnu' } })).statusCode,
    204
  )
  const jeton = await creerSession(db, (await db.query('SELECT id FROM users')).rows[0].id)
  await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: jeton } })
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: jeton } })).statusCode,
    204
  )
})

test('logout ne révoque que la session concernée', async () => {
  const a = cookieSid(await login({ email: EMAIL, password: MDP })).value
  const b = cookieSid(await login({ email: EMAIL, password: MDP })).value
  await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: a } })
  assert.equal(await trouverUtilisateur(db, a), null)
  assert.ok(await trouverUtilisateur(db, b))
})

// ---------- me ----------

test('me sans session : 401 UNAUTHENTICATED au format du §5', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
  assert.equal(res.statusCode, 401)
  assert.equal(res.json().error.code, 'UNAUTHENTICATED')
})

test('me avec une session expirée : 401', async () => {
  const jeton = cookieSid(await login({ email: EMAIL, password: MDP })).value
  await db.query(`UPDATE sessions SET expires_at = now() - interval '1 second'`)
  const res = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: jeton } })
  assert.equal(res.statusCode, 401)
})

// ---------- limitation de débit ----------

test('la 6e tentative de connexion en une minute répond 429 RATE_LIMITED, même avec le bon mot de passe', async () => {
  const appLimitee = buildApp({ db, nodeEnv: 'test' }) // limite par défaut : 5 par minute
  for (let i = 1; i <= 5; i++) {
    const res = await login({ email: EMAIL, password: 'mauvais-mot-de-passe' }, { app: appLimitee })
    assert.equal(res.statusCode, 401, `tentative ${i}`)
  }
  const bloque = await login({ email: EMAIL, password: MDP }, { app: appLimitee })
  assert.equal(bloque.statusCode, 429)
  assert.equal(bloque.json().error.code, 'RATE_LIMITED')
  assert.ok(Number(bloque.headers['retry-after']) > 0)
  assert.equal(cookieSid(bloque), undefined)
  await appLimitee.close()
})

test('la limite est comptée par adresse IP', async () => {
  const appLimitee = buildApp({ db, nodeEnv: 'test' })
  const depuis = (ip) => ({ inject: { remoteAddress: ip } })
  for (let i = 0; i < 6; i++) {
    await login({ email: EMAIL, password: 'mauvais-mot-de-passe' }, { app: appLimitee, ...depuis('10.0.0.1') })
  }
  assert.equal((await login({ email: EMAIL, password: MDP }, { app: appLimitee, ...depuis('10.0.0.1') })).statusCode, 429)
  assert.equal((await login({ email: EMAIL, password: MDP }, { app: appLimitee, ...depuis('10.0.0.2') })).statusCode, 200)
  await appLimitee.close()
})

test('sans proxy de confiance, un en-tête X-Forwarded-For forgé ne contourne pas la limite', async () => {
  const appLimitee = buildApp({ db, nodeEnv: 'test' }) // aucun proxy de confiance
  let dernier
  for (let i = 0; i < 6; i++) {
    dernier = await login(
      { email: EMAIL, password: 'mauvais-mot-de-passe' },
      { app: appLimitee, inject: { headers: { 'x-forwarded-for': `1.2.3.${i}` } } }
    )
  }
  assert.equal(dernier.statusCode, 429)
  await appLimitee.close()
})

// Derrière un proxy de confiance (ici : le réseau local), l'IP du visiteur est la dernière
// adresse ajoutée par le proxy, jamais une valeur écrite par le visiteur.
test('avec un proxy de confiance, la limite suit l\'IP ajoutée par le proxy, pas les valeurs forgées', async () => {
  const appProxy = buildApp({ db, nodeEnv: 'test', trustProxy: 'loopback' })
  const viaProxy = (xff) => ({ app: appProxy, inject: { remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': xff } } })
  let dernier
  for (let i = 0; i < 6; i++) {
    // Le visiteur change sa valeur forgée à chaque fois ; le proxy ajoute toujours 203.0.113.9.
    dernier = await login({ email: EMAIL, password: 'mauvais-mot-de-passe' }, viaProxy(`66.66.66.${i}, 203.0.113.9`))
  }
  assert.equal(dernier.statusCode, 429)
  // Un autre visiteur, vu par le proxy avec une autre IP, n'est pas bloqué.
  assert.equal((await login({ email: EMAIL, password: MDP }, viaProxy('66.66.66.0, 203.0.113.10'))).statusCode, 200)
  await appProxy.close()
})

test('un client direct non fiable ne peut pas se faire passer pour un autre, même si un proxy est configuré', async () => {
  const appProxy = buildApp({ db, nodeEnv: 'test', trustProxy: 'loopback' })
  let dernier
  for (let i = 0; i < 6; i++) {
    dernier = await login(
      { email: EMAIL, password: 'mauvais-mot-de-passe' },
      { app: appProxy, inject: { remoteAddress: '8.8.8.8', headers: { 'x-forwarded-for': `9.9.9.${i}` } } }
    )
  }
  assert.equal(dernier.statusCode, 429)
  await appProxy.close()
})

test('la limitation ne s\'applique pas aux autres routes', async () => {
  const appLimitee = buildApp({ db, nodeEnv: 'test' })
  for (let i = 0; i < 20; i++) {
    assert.equal((await appLimitee.inject({ method: 'GET', url: '/api/health' })).statusCode, 200)
  }
  await appLimitee.close()
})

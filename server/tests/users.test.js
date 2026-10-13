import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { getTestDb, resetDb } from './helpers.js'
import { creerAdmin,reinitialiserMotDePasse, validerEmail, validerMotDePasse, ErreurValidation } from '../src/lib/users.js'

let db

before(async () => {
  db = await getTestDb()
})

beforeEach(async () => {
  await resetDb(db)
})

after(async () => {
  if (db) await db.end()
})

const MDP = 'un-bon-mot-de-passe'

test('creerAdmin crée un admin avec un hash bcrypt de coût 12 (pas le mot de passe)', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP)
  assert.deepEqual(admin, { id: admin.id, email: 'moi@exemple.com', role: 'admin' })
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [admin.id])
  assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/)
  assert.notEqual(rows[0].password_hash, MDP)
  assert.equal(await bcrypt.compare(MDP, rows[0].password_hash), true)
  assert.equal(await bcrypt.compare('autre-mot-de-passe', rows[0].password_hash), false)
})

test('creerAdmin enregistre l\'e-mail en minuscules et sans espaces autour', async () => {
  const admin = await creerAdmin(db, '  Moi@Exemple.COM ', MDP, { cout: 4 })
  assert.equal(admin.email, 'moi@exemple.com')
})

test('creerAdmin refuse un second compte avec le même e-mail, casse différente', async () => {
  await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  await assert.rejects(
    () => creerAdmin(db, 'MOI@exemple.com', MDP, { cout: 4 }),
    (err) => err instanceof ErreurValidation && /existe déjà/.test(err.message)
  )
})

test('creerAdmin refuse un mot de passe trop court et n\'écrit rien', async () => {
  await assert.rejects(() => creerAdmin(db, 'moi@exemple.com', 'court', { cout: 4 }), ErreurValidation)
  const { rows } = await db.query('SELECT count(*)::int AS n FROM users')
  assert.equal(rows[0].n, 0)
})

test('validerMotDePasse : 12 caractères minimum, 72 octets maximum (pas 72 caractères)', () => {
  assert.throws(() => validerMotDePasse('a'.repeat(11)), ErreurValidation)
  assert.equal(validerMotDePasse('a'.repeat(12)), 'a'.repeat(12))
  assert.equal(validerMotDePasse('a'.repeat(72)), 'a'.repeat(72))
  assert.throws(() => validerMotDePasse('a'.repeat(73)), ErreurValidation)
  // 40 caractères accentués = 80 octets : refusé, alors qu'il ne fait que 40 caractères
  assert.throws(() => validerMotDePasse('é'.repeat(40)), /octets/)
  // 36 caractères accentués = 72 octets : accepté
  assert.equal(validerMotDePasse('é'.repeat(36)), 'é'.repeat(36))
})

test('validerEmail refuse les adresses invalides', () => {
  for (const mauvais of ['', '   ', 'sans-arobase', 'a@b', '@exemple.com', 'a b@exemple.com', undefined, 'a'.repeat(250) + '@x.fr']) {
    assert.throws(() => validerEmail(mauvais), ErreurValidation)
  }
  assert.equal(validerEmail(' Moi@Exemple.com '), 'moi@exemple.com')
})

async function ajouterSessions(userId, nombre) {
  for (let i = 0; i < nombre; i++) {
    await db.query(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES ($1, $2, now() + interval '1 day')`,
      [`session-test-${userId}-${i}-${Math.random()}`, userId]
    )
  }
}

async function compterSessions(userId) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [userId])
  return rows[0].n
}

const NOUVEAU_MDP = 'un-autre-mot-de-passe'

test('reinitialiserMotDePasse remplace le hash et renvoie le compte', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  const nouveauHash = await bcrypt.hash(NOUVEAU_MDP, 4)

  const compte = await reinitialiserMotDePasse(db, 'moi@exemple.com', nouveauHash)

  assert.deepEqual(compte, { id: admin.id, email: 'moi@exemple.com', sessions_fermees: 0 })
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [admin.id])
  assert.equal(rows[0].password_hash, nouveauHash)
  assert.equal(await bcrypt.compare(NOUVEAU_MDP, rows[0].password_hash), true)
  assert.equal(await bcrypt.compare(MDP, rows[0].password_hash), false)
})

test('reinitialiserMotDePasse supprime toutes les sessions du compte', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  await ajouterSessions(admin.id, 2)

  const compte = await reinitialiserMotDePasse(db, 'moi@exemple.com', await bcrypt.hash(NOUVEAU_MDP, 4))

  assert.equal(compte.sessions_fermees, 2)
  assert.equal(await compterSessions(admin.id), 0)
})

test('reinitialiserMotDePasse ne touche ni au hash ni aux sessions des autres comptes', async () => {
  const premier = await creerAdmin(db, 'premier@exemple.com', MDP, { cout: 4 })
  const second = await creerAdmin(db, 'second@exemple.com', MDP, { cout: 4 })
  await ajouterSessions(premier.id, 1)
  await ajouterSessions(second.id, 1)
  const avant = await db.query('SELECT password_hash FROM users WHERE id = $1', [second.id])

  await reinitialiserMotDePasse(db, 'premier@exemple.com', await bcrypt.hash(NOUVEAU_MDP, 4))

  assert.equal(await compterSessions(second.id), 1)
  const apres = await db.query('SELECT password_hash FROM users WHERE id = $1', [second.id])
  assert.equal(apres.rows[0].password_hash, avant.rows[0].password_hash)
})

test('reinitialiserMotDePasse renvoie null pour un e-mail inconnu et ne modifie rien', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  await ajouterSessions(admin.id, 1)
  const avant = await db.query('SELECT password_hash FROM users WHERE id = $1', [admin.id])

  const compte = await reinitialiserMotDePasse(db, 'inconnu@exemple.com', await bcrypt.hash(NOUVEAU_MDP, 4))

  assert.equal(compte, null)
  assert.equal(await compterSessions(admin.id), 1)
  const apres = await db.query('SELECT password_hash FROM users WHERE id = $1', [admin.id])
  assert.equal(apres.rows[0].password_hash, avant.rows[0].password_hash)
})
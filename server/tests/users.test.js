import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { getTestDb, resetDb } from './helpers.js'
import { creerAdmin, validerEmail, validerMotDePasse, ErreurValidation } from '../src/lib/users.js'

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
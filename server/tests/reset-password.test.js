import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { getTestDb, resetDb } from './helpers.js'
import { creerAdmin } from '../src/lib/users.js'
import { creerSession } from '../src/lib/sessions.js'

// Même principe que creer-admin.test.js : le vrai script, dans un processus séparé.
const dossierServer = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MDP = 'un-bon-mot-de-passe'
const NOUVEAU_MDP = 'un-autre-mot-de-passe'

function lancerScript(args, entree) {
  return spawnSync(process.execPath, ['scripts/reset-password.js', ...args], {
    cwd: dossierServer,
    input: entree,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    timeout: 30_000,
  })
}

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

async function hashDe(id) {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [id])
  return rows[0].password_hash
}

async function nombreSessions() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions')
  return rows[0].n
}

test('remplace le mot de passe, ferme les sessions et affiche une confirmation', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  await creerSession(db, admin.id)
  await creerSession(db, admin.id)

  const r = lancerScript(['Moi@Exemple.com'], `${NOUVEAU_MDP}\n${NOUVEAU_MDP}\n`)

  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Mot de passe remplacé pour moi@exemple\.com/)
  assert.match(r.stdout, /Sessions fermées : 2/)
  const hash = await hashDe(admin.id)
  assert.equal(await bcrypt.compare(NOUVEAU_MDP, hash), true)
  assert.equal(await bcrypt.compare(MDP, hash), false)
  assert.equal(await nombreSessions(), 0)
})

test('les mots de passe n\'apparaissent jamais dans la sortie du script', async () => {
  await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  const r = lancerScript(['moi@exemple.com'], `${NOUVEAU_MDP}\n${NOUVEAU_MDP}\n`)
  for (const secret of [MDP, NOUVEAU_MDP]) {
    assert.ok(!r.stdout.includes(secret))
    assert.ok(!r.stderr.includes(secret))
  }
})

test('refuse un e-mail inconnu et ne modifie rien', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  await creerSession(db, admin.id)
  const avant = await hashDe(admin.id)

  const r = lancerScript(['inconnu@exemple.com'], `${NOUVEAU_MDP}\n${NOUVEAU_MDP}\n`)

  assert.equal(r.status, 1)
  assert.match(r.stderr, /Aucun compte/)
  assert.equal(await hashDe(admin.id), avant)
  assert.equal(await nombreSessions(), 1)
})

test('refuse si les deux mots de passe sont différents et ne modifie rien', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  await creerSession(db, admin.id)
  const avant = await hashDe(admin.id)

  const r = lancerScript(['moi@exemple.com'], `${NOUVEAU_MDP}\nautre-chose-de-long\n`)

  assert.equal(r.status, 1)
  assert.match(r.stderr, /différents/)
  assert.equal(await hashDe(admin.id), avant)
  assert.equal(await nombreSessions(), 1)
})

test('refuse un mot de passe trop court et ne modifie rien', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  await creerSession(db, admin.id)
  const avant = await hashDe(admin.id)

  const r = lancerScript(['moi@exemple.com'], 'court\ncourt\n')

  assert.equal(r.status, 1)
  assert.match(r.stderr, /au moins 12 caractères/)
  assert.equal(await hashDe(admin.id), avant)
  assert.equal(await nombreSessions(), 1)
})

test('sans adresse e-mail, affiche le mode d\'emploi', async () => {
  const r = lancerScript([], '')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Usage/)
})

test('une entrée vide est refusée proprement et ne modifie rien', async () => {
  const admin = await creerAdmin(db, 'moi@exemple.com', MDP, { cout: 4 })
  const avant = await hashDe(admin.id)

  const r = lancerScript(['moi@exemple.com'], '')

  assert.equal(r.status, 1)
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/)
  assert.equal(await hashDe(admin.id), avant)
})
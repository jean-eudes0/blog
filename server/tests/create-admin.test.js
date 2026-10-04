import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { getTestDb, resetDb } from './helpers.js'

// On lance le vrai script dans un processus séparé, comme le ferait
// `npm run create-admin`, avec les réponses envoyées sur son entrée.
const dossierServer = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MDP = 'un-bon-mot-de-passe'

function lancerScript(args, entree) {
  return spawnSync(process.execPath, ['scripts/create-admin.js', ...args], {
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

async function nombreUtilisateurs() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM users')
  return rows[0].n
}

test('crée le compte admin avec un hash bcrypt et affiche une confirmation', async () => {
  const r = lancerScript(['Moi@Exemple.com'], `${MDP}\n${MDP}\n`)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Compte admin créé : moi@exemple\.com/)
  const { rows } = await db.query('SELECT email, role, password_hash FROM users')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].email, 'moi@exemple.com')
  assert.equal(rows[0].role, 'admin')
  assert.equal(await bcrypt.compare(MDP, rows[0].password_hash), true)
})

test('le mot de passe n\'apparaît jamais dans la sortie du script', async () => {
  const r = lancerScript(['moi@exemple.com'], `${MDP}\n${MDP}\n`)
  assert.ok(!r.stdout.includes(MDP))
  assert.ok(!r.stderr.includes(MDP))
})

test('refuse si les deux mots de passe sont différents et ne crée rien', async () => {
  const r = lancerScript(['moi@exemple.com'], `${MDP}\nun-autre-mot-de-passe\n`)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /différents/)
  assert.equal(await nombreUtilisateurs(), 0)
})

test('refuse un mot de passe trop court et ne crée rien', async () => {
  const r = lancerScript(['moi@exemple.com'], 'court\ncourt\n')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /au moins 12 caractères/)
  assert.equal(await nombreUtilisateurs(), 0)
})

test('refuse un mot de passe de plus de 72 octets (accents comptés double)', async () => {
  const long = 'é'.repeat(40)
  const r = lancerScript(['moi@exemple.com'], `${long}\n${long}\n`)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /72 octets/)
  assert.equal(await nombreUtilisateurs(), 0)
})

test('refuse un e-mail déjà utilisé, même avec une casse différente', async () => {
  assert.equal(lancerScript(['moi@exemple.com'], `${MDP}\n${MDP}\n`).status, 0)
  const r = lancerScript(['MOI@exemple.com'], `${MDP}\n${MDP}\n`)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /existe déjà/)
  assert.equal(await nombreUtilisateurs(), 1)
})

test('sans adresse e-mail, affiche le mode d\'emploi', async () => {
  const r = lancerScript([], '')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Usage/)
})

test('refuse une adresse e-mail invalide avant même de demander le mot de passe', async () => {
  const r = lancerScript(['pas-un-email'], `${MDP}\n${MDP}\n`)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /invalide/)
  assert.ok(!r.stdout.includes('Mot de passe'))
})

test('une entrée vide (Ctrl+D) est refusée proprement', async () => {
  const r = lancerScript(['moi@exemple.com'], '')
  assert.equal(r.status, 1)
  assert.equal(await nombreUtilisateurs(), 0)
})
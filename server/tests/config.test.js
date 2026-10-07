import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

const base = { DATABASE_URL: 'postgresql://u:p@localhost/db' }

test('une configuration minimale valide reçoit les valeurs par défaut', () => {
  const c = loadConfig(base)
  assert.deepEqual(c, {
    nodeEnv: 'development',
    port: 3000,
    databaseUrl: base.DATABASE_URL,
    publicUrl: 'http://localhost:5173',
    trustProxy: false,
  })
})

test('DATABASE_URL absente est refusée', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL est obligatoire/)
})

test('PORT invalide est refusé', () => {
  for (const port of ['abc', '0', '-1', '1.5']) {
    assert.throws(() => loadConfig({ ...base, PORT: port }), /PORT doit être un entier positif/)
  }
})

test('PUBLIC_URL est obligatoire en production', () => {
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production' }), /PUBLIC_URL est obligatoire/)
})

test('toutes les erreurs sont signalées ensemble', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'prod', PORT: 'abc', DATABASE_URL: 'mysql://x' }),
    (err) => /NODE_ENV/.test(err.message) && /PORT/.test(err.message) && /DATABASE_URL/.test(err.message)
  )
})

test('le mot de passe de la base ne fuit jamais dans le message d\'erreur', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'mysql://neondb_owner:MOTDEPASSE_SECRET@hote/db' }),
    (err) => !err.message.includes('MOTDEPASSE_SECRET')
  )
})

test('TRUST_PROXY est désactivé par défaut (false), aussi quand il est vide', () => {
  assert.equal(loadConfig(base).trustProxy, false)
  assert.equal(loadConfig({ ...base, TRUST_PROXY: '' }).trustProxy, false)
  assert.equal(loadConfig({ ...base, TRUST_PROXY: '  ' }).trustProxy, false)
})

test('TRUST_PROXY accepte des noms, des adresses et des plages séparés par des virgules', () => {
  assert.equal(loadConfig({ ...base, TRUST_PROXY: 'loopback' }).trustProxy, 'loopback')
  assert.equal(
    loadConfig({ ...base, TRUST_PROXY: 'loopback, linklocal , uniquelocal' }).trustProxy,
    'loopback,linklocal,uniquelocal'
  )
  assert.equal(loadConfig({ ...base, TRUST_PROXY: '10.0.0.0/8,203.0.113.9,::1' }).trustProxy, '10.0.0.0/8,203.0.113.9,::1')
})

test('TRUST_PROXY refuse un nombre de sauts (inutilisable avec Fastify) et le reste', () => {
  for (const valeur of ['1', '0', 'true', 'abc', 'loopback,abc', 'loopback,,', '10.0.0.0/8; DROP']) {
    assert.throws(() => loadConfig({ ...base, TRUST_PROXY: valeur }), /TRUST_PROXY/, valeur)
  }
})
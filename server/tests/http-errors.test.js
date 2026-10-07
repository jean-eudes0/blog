import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  erreurHttp,
  nonTrouve,
  nonAuthentifie,
  identifiantsInvalides,
  interdit,
  tropDeRequetes,
} from '../src/lib/http-errors.js'

test('erreurHttp porte le statut, le code et le message', () => {
  const err = erreurHttp(418, 'TEAPOT', 'Je suis une théière')
  assert.ok(err instanceof Error)
  assert.equal(err.statusCode, 418)
  assert.equal(err.code, 'TEAPOT')
  assert.equal(err.message, 'Je suis une théière')
})

test('chaque erreur prête à l\'emploi a le statut et le code de docs/api.md §5', () => {
  const attendus = [
    [nonTrouve(), 404, 'NOT_FOUND'],
    [nonAuthentifie(), 401, 'UNAUTHENTICATED'],
    [identifiantsInvalides(), 401, 'INVALID_CREDENTIALS'],
    [interdit(), 403, 'FORBIDDEN'],
    [tropDeRequetes(), 429, 'RATE_LIMITED'],
  ]
  for (const [err, statut, code] of attendus) {
    assert.equal(err.statusCode, statut)
    assert.equal(err.code, code)
  }
})

test('aucun code d\'erreur métier ne commence par FST_ (sinon le gestionnaire le masquerait)', () => {
  for (const err of [nonTrouve(), nonAuthentifie(), identifiantsInvalides(), interdit(), tropDeRequetes()]) {
    assert.ok(!err.code.startsWith('FST_'))
  }
})
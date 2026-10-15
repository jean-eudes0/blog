import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugifier, slugAvecSuffixe, normaliserTags } from '../src/lib/slug.js'

test('slugifier retire les accents et met en minuscules', () => {
  assert.equal(slugifier('Déclic'), 'declic')
  assert.equal(slugifier('Pourquoi mon ErrorBoundary ne captait rien'), 'pourquoi-mon-errorboundary-ne-captait-rien')
})

test('slugifier fusionne les séparateurs et retire les tirets de début et de fin', () => {
  assert.equal(slugifier('  --Hello,   World!!  '), 'hello-world')
  assert.equal(slugifier('C++ & C#'), 'c-c')
})

test('slugifier gère les ligatures', () => {
  assert.equal(slugifier('Œuvre'), 'oeuvre')
  assert.equal(slugifier('Straße'), 'strasse')
})

test('slugifier retombe sur « article » quand il ne reste rien', () => {
  for (const vide of ['', '   ', '!!!', '日本語', undefined, null]) {
    assert.equal(slugifier(vide), 'article')
  }
  assert.equal(slugifier('!!!', 'tag'), 'tag')
})

test('le slug produit respecte la contrainte de la base (minuscules, sans espace)', () => {
  const slug = slugifier('  É À Ç  Ünï — Test 42  ')
  assert.equal(slug, slug.toLowerCase())
  assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/)
})

test('slugAvecSuffixe : pas de suffixe au premier essai, puis -2, -3', () => {
  assert.equal(slugAvecSuffixe('mon-article', 1), 'mon-article')
  assert.equal(slugAvecSuffixe('mon-article', 2), 'mon-article-2')
  assert.equal(slugAvecSuffixe('mon-article', 3), 'mon-article-3')
})

test('normaliserTags nettoie les noms et supprime les doublons de slug', () => {
  assert.deepEqual(normaliserTags(['React', ' react ', 'REACT', 'Node.js']), [
    { name: 'React', slug: 'react' },
    { name: 'Node.js', slug: 'node-js' },
  ])
})

test('normaliserTags ignore les noms vides et compacte les espaces internes', () => {
  assert.deepEqual(normaliserTags(['', '   ', 'bonnes   pratiques']), [
    { name: 'bonnes pratiques', slug: 'bonnes-pratiques' },
  ])
  assert.deepEqual(normaliserTags(undefined), [])
})
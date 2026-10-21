import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VALEURS_VIDES,
  articleVersValeurs,
  champsModifies,
  erreursDepuisApi,
  estModifie,
  tagsDepuisTexte,
  validerArticle,
  valeursVersCorps,
} from './validation-article.js'

// Les limites sont écrites en dur, comme dans docs/api.md §6 : si quelqu'un change la constante LIMITES,
// ces tests doivent échouer (un test qui relirait la constante ne verrait jamais le changement).
const valide = (extra = {}) => ({ ...VALEURS_VIDES, title: 'Un titre', contentMd: '# Salut', ...extra })

test('tagsDepuisTexte : espaces nettoyés, vides et doublons retirés (casse ignorée), 1re graphie gardée', () => {
  assert.deepEqual(tagsDepuisTexte(' react,  Node   JS ,, REACT , '), ['react', 'Node JS'])
  assert.deepEqual(tagsDepuisTexte(''), [])
  assert.deepEqual(tagsDepuisTexte(' , , '), [])
})

test('valeursVersCorps : titre et extrait nettoyés, coverUrl vide -> null, contenu inchangé', () => {
  const corps = valeursVersCorps(valide({ title: '  Titre  ', excerpt: ' ext ', coverUrl: '   ', contentMd: '  # x\n', tags: 'a, b' }))
  assert.deepEqual(corps, { title: 'Titre', contentMd: '  # x\n', excerpt: 'ext', coverUrl: null, tags: ['a', 'b'] })
})

test('un article valide ne donne aucune erreur', () => {
  assert.deepEqual(validerArticle(valide({ excerpt: 'ok', coverUrl: 'https://exemple.com/a.png', tags: 'a, b, c, d, e' })), {})
})

test('titre : obligatoire (espaces seuls refusés), au plus 150 caractères après nettoyage', () => {
  assert.ok(validerArticle(valide({ title: '' })).title)
  assert.ok(validerArticle(valide({ title: '    ' })).title)
  assert.deepEqual(validerArticle(valide({ title: `  ${'a'.repeat(150)}  ` })), {})
  assert.ok(validerArticle(valide({ title: 'a'.repeat(150 + 1) })).title)
})

test('les longueurs comptent des caractères, pas des unités UTF-16 (un emoji = 1)', () => {
  assert.deepEqual(validerArticle(valide({ title: '😀'.repeat(150) })), {})
  assert.ok(validerArticle(valide({ title: '😀'.repeat(150 + 1) })).title)
})

test('contenu : obligatoire, au plus 100 000 caractères', () => {
  assert.ok(validerArticle(valide({ contentMd: ' \n ' })).contentMd)
  assert.deepEqual(validerArticle(valide({ contentMd: 'c'.repeat(100_000) })), {})
  assert.ok(validerArticle(valide({ contentMd: 'c'.repeat(100_000 + 1) })).contentMd)
})

test('extrait : au plus 300 caractères', () => {
  assert.deepEqual(validerArticle(valide({ excerpt: 'e'.repeat(300) })), {})
  assert.ok(validerArticle(valide({ excerpt: 'e'.repeat(300 + 1) })).excerpt)
})

test('coverUrl : vide ou http(s) ; jamais javascript:, data:, ftp:, espaces, adresse sans protocole', () => {
  assert.deepEqual(validerArticle(valide({ coverUrl: '' })), {})
  assert.deepEqual(validerArticle(valide({ coverUrl: 'http://x.com/a' })), {})
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.com/a', 'x.com/a', 'https://a b.com', 'https://', '//x.com']) {
    assert.ok(validerArticle(valide({ coverUrl: url })).coverUrl, url)
  }
  const base = 'https://x.com/' // 14 caractères
  assert.deepEqual(validerArticle(valide({ coverUrl: base + 'a'.repeat(486) })), {}, 'exactement 500 caractères : valide')
  assert.ok(validerArticle(valide({ coverUrl: base + 'a'.repeat(487) })).coverUrl, '501 caractères : refusé')
})

test('tags : au plus 5 (doublons comptés une fois), 30 caractères chacun', () => {
  assert.deepEqual(validerArticle(valide({ tags: 'a, b, c, d, e, E' })), {})
  assert.ok(validerArticle(valide({ tags: 'a, b, c, d, e, f' })).tags)
  assert.deepEqual(validerArticle(valide({ tags: 'x'.repeat(30) })), {})
  assert.ok(validerArticle(valide({ tags: 'x'.repeat(30 + 1) })).tags)
})

test('le caractère NUL est refusé dans chaque champ texte', () => {
  for (const champ of ['title', 'excerpt', 'contentMd', 'coverUrl', 'tags']) {
    assert.ok(validerArticle(valide({ [champ]: 'a\u0000b' }))[champ], champ)
  }
})

test('estModifie : faux au départ, vrai après un vrai changement, faux si seuls les espaces autour changent', () => {
  const ref = valide({ title: 'T', tags: 'a, b' })
  assert.equal(estModifie(ref, ref), false)
  assert.equal(estModifie({ ...ref, title: 'T2' }, ref), true)
  assert.equal(estModifie({ ...ref, title: '  T  ' }, ref), false)
  assert.equal(estModifie({ ...ref, tags: 'b, a' }, ref), true)
  assert.equal(estModifie({ ...ref, contentMd: ref.contentMd + ' ' }, ref), true)
})

test('articleVersValeurs : coverUrl null devient vide, tags en texte', () => {
  const v = articleVersValeurs({ title: 'T', excerpt: '', coverUrl: null, contentMd: 'c', tags: [{ name: 'a', slug: 'a' }, { name: 'B b', slug: 'b-b' }] })
  assert.deepEqual(v, { title: 'T', excerpt: '', coverUrl: '', contentMd: 'c', tags: 'a, B b' })
})

test('erreursDepuisApi : champs connus seulement, tags/1 devient tags', () => {
  assert.deepEqual(erreursDepuisApi([{ field: 'tags/1', message: 'x' }, { field: 'title', message: 'y' }, { field: '(corps)', message: 'z' }]), {
    tags: 'Valeur refusée par le serveur.',
    title: 'Valeur refusée par le serveur.',
  })
  assert.deepEqual(erreursDepuisApi(undefined), {})
})

test('champsModifies : seulement ce qui a changé, au format du corps PATCH', () => {
  const ref = valide({ title: 'T', excerpt: 'e', coverUrl: 'https://x.com/a.png', tags: 'a, b' })
  assert.deepEqual(champsModifies(ref, ref), {})
  assert.deepEqual(champsModifies({ ...ref, title: '  T  ' }, ref), {}, 'des espaces autour ne comptent pas')
  assert.deepEqual(champsModifies({ ...ref, title: 'Autre' }, ref), { title: 'Autre' })
  assert.deepEqual(champsModifies({ ...ref, coverUrl: '' }, ref), { coverUrl: null }, 'vider la couverture envoie null')
  assert.deepEqual(champsModifies({ ...ref, tags: 'b, a' }, ref), { tags: ['b', 'a'] })
  assert.deepEqual(champsModifies({ ...ref, tags: '' }, ref), { tags: [] }, 'retirer tous les tags envoie []')
  assert.deepEqual(champsModifies({ ...ref, title: 'Z', contentMd: 'nouveau' }, ref), { title: 'Z', contentMd: 'nouveau' })
})
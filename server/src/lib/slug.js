const LIGATURES = { 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' }

// Règles de docs/api.md §7 : minuscules, sans accents, tout le reste devient « - ».
export function slugifier(texte, repli = 'article') {
  const slug = String(texte ?? '')
    .toLowerCase()
    .replace(/[œæß]/g, (c) => LIGATURES[c])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || repli
}

// Doublon : premier essai sans suffixe, puis -2, -3...
export function slugAvecSuffixe(base, numero) {
  return numero <= 1 ? base : `${base}-${numero}`
}

// Nettoie les noms de tags, calcule leurs slugs et supprime les doublons de slug
// (« React », « react » et « REACT » donnent un seul tag : on garde le premier nom).
export function normaliserTags(noms) {
  const vus = new Set()
  const tags = []
  for (const brut of noms ?? []) {
    const name = String(brut).trim().replace(/\s+/g, ' ')
    if (!name) continue
    const slug = slugifier(name, 'tag')
    if (vus.has(slug)) continue
    vus.add(slug)
    tags.push({ name, slug })
  }
  return tags
}
// Génère un slug (voir docs/api.md §7) : minuscules, sans accents,
// tout ce qui n'est pas lettre ou chiffre devient un tiret.
export function slugify(texte) {
  const slug = String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'article'
}
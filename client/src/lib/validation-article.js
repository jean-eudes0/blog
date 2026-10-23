// Règles du formulaire d'article. Ce sont celles de docs/api.md §6, vérifiées ICI pour
// répondre tout de suite à l'utilisateur ; l'API les vérifie de toute façon (elle ne fait
// jamais confiance au navigateur) et ses refus sont aussi affichés (erreursDepuisApi).
// Fichier sans React : il se teste avec `node --test`.

export const LIMITES = { titre: 150, extrait: 300, contenu: 100_000, tag: 30, tags: 5, url: 500 }

const longueur = (texte) => [...texte].length // en caractères, pas en unités UTF-16 (un emoji = 1)

// « react, Node  JS ,, react » -> ['react', 'Node JS'] : espaces nettoyés, vides retirés,
// doublons retirés (sans tenir compte de la casse, comme le fait l'API avec les slugs).
export function tagsDepuisTexte(texte) {
  const vus = new Set()
  const tags = []
  for (const brut of texte.split(',')) {
    const nom = brut.trim().replace(/\s+/g, ' ')
    if (!nom || vus.has(nom.toLowerCase())) continue
    vus.add(nom.toLowerCase())
    tags.push(nom)
  }
  return tags
}

export function tagsVersTexte(tags) {
  return tags.join(', ')
}

// Valeurs du formulaire (tout en texte) -> corps de la requête API.
export function valeursVersCorps(valeurs) {
  return {
    title: valeurs.title.trim(),
    contentMd: valeurs.contentMd,
    excerpt: valeurs.excerpt.trim(),
    coverUrl: valeurs.coverUrl.trim() || null,
    tags: tagsDepuisTexte(valeurs.tags),
  }
}

// Article renvoyé par l'API -> valeurs du formulaire.
export function articleVersValeurs(article) {
  return {
    title: article.title,
    excerpt: article.excerpt,
    coverUrl: article.coverUrl ?? '',
    contentMd: article.contentMd,
    tags: tagsVersTexte(article.tags.map((t) => t.name)),
  }
}

export const VALEURS_VIDES = { title: '', excerpt: '', coverUrl: '', contentMd: '', tags: '' }

// Le formulaire a-t-il changé par rapport à la dernière version enregistrée ?
export function estModifie(valeurs, reference) {
  return JSON.stringify(valeursVersCorps(valeurs)) !== JSON.stringify(valeursVersCorps(reference))
}

// Seuls les champs qui ont changé, au format du corps de PATCH (l'API exige au moins un champ,
// et un champ envoyé « pour rien » ne ferait que brouiller updated_at pour rien).
export function champsModifies(valeurs, reference) {
  const apres = valeursVersCorps(valeurs)
  const avant = valeursVersCorps(reference)
  const modifies = {}
  for (const cle of Object.keys(apres)) {
    if (JSON.stringify(apres[cle]) !== JSON.stringify(avant[cle])) modifies[cle] = apres[cle]
  }
  return modifies
}

// Renvoie { champ: message } ; objet vide = tout est valide.
export function validerArticle(valeurs) {
  const erreurs = {}
  const corps = valeursVersCorps(valeurs)

  if (corps.title.length === 0) erreurs.title = 'Le titre est obligatoire.'
  else if (longueur(corps.title) > LIMITES.titre) erreurs.title = `Le titre fait au plus ${LIMITES.titre} caractères.`

  if (corps.contentMd.trim().length === 0) erreurs.contentMd = 'Le contenu est obligatoire.'
  else if (longueur(corps.contentMd) > LIMITES.contenu) erreurs.contentMd = `Le contenu fait au plus ${LIMITES.contenu} caractères.`

  if (longueur(corps.excerpt) > LIMITES.extrait) erreurs.excerpt = `L’extrait fait au plus ${LIMITES.extrait} caractères.`

  if (corps.coverUrl !== null) {
    // https seulement : une adresse « javascript: » dans une image serait une faille XSS, et un navigateur
    // bloque de toute façon une image en http:// affichée sur un site en https://.
    if (!/^https:\/\/\S+$/.test(corps.coverUrl)) erreurs.coverUrl = 'Adresse invalide : elle doit commencer par https://.'
    else if (longueur(corps.coverUrl) > LIMITES.url) erreurs.coverUrl = `L’adresse fait au plus ${LIMITES.url} caractères.`
  }

  if (corps.tags.length > LIMITES.tags) erreurs.tags = `Au plus ${LIMITES.tags} tags.`
  else if (corps.tags.some((t) => longueur(t) > LIMITES.tag)) erreurs.tags = `Chaque tag fait au plus ${LIMITES.tag} caractères.`

  // Le caractère NUL (U+0000) ferait échouer PostgreSQL : l'API le refuse.
  for (const [champ, texte] of [['title', valeurs.title], ['excerpt', valeurs.excerpt], ['contentMd', valeurs.contentMd], ['coverUrl', valeurs.coverUrl], ['tags', valeurs.tags]]) {
    if (texte.includes('\u0000')) erreurs[champ] = 'Caractère interdit dans ce champ.'
  }
  return erreurs
}

// Refus 400 de l'API : { error: { details: [{ field: 'tags/1', message }] } } -> { tags: '...' }.
// Les messages d'Ajv sont en anglais : on affiche un message français générique par champ.
export function erreursDepuisApi(details) {
  const erreurs = {}
  for (const { field } of details ?? []) {
    const champ = String(field).split('/')[0]
    if (['title', 'contentMd', 'excerpt', 'coverUrl', 'tags'].includes(champ)) {
      erreurs[champ] = 'Valeur refusée par le serveur.'
    }
  }
  return erreurs
}
import { slugifier, slugAvecSuffixe, normaliserTags } from './slug.js'
import { conflit } from './http-errors.js'
import { chargerTagsPour } from './tags.js'

// Exécute `fn` dans UNE transaction, sur un client dédié du pool (docs/api.md §7) :
// COMMIT si tout réussit, ROLLBACK au premier échec. Le client est toujours rendu au pool.
async function enTransaction(db, fn) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const resultat = await fn(client)
    await client.query('COMMIT')
    return resultat
  } catch (err) {
    // Si la connexion est tombée, ROLLBACK échoue aussi : on ne doit pas masquer l'erreur d'origine.
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Lecture complète d'un article (brouillon compris) avec ses tags.
export async function chargerArticleAdmin(db, id) {
  const { rows } = await db.query(
    `SELECT
       id, slug, title, status, excerpt, content_md AS "contentMd", cover_url AS "coverUrl",
       published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt",
       GREATEST(1, round(char_length(content_md) / 1100.0))::int AS "readingTime"
     FROM articles
     WHERE id = $1`,
    [id]
  )
  const article = rows[0]
  if (!article) return null

  const { rows: tags } = await db.query(
    `SELECT t.name, t.slug
     FROM article_tags at
     JOIN tags t ON t.id = at.tag_id
     WHERE at.article_id = $1
     ORDER BY t.name`,
    [id]
  )
  return { ...article, tags }
}

// Liste paginée de TOUS les articles, brouillons compris, du dernier modifié
// au plus ancien. `status` (optionnel) filtre sur 'draft' ou 'published'.
export async function listerArticlesAdmin(db, { page, limit, status }) {
  // null = pas de filtre. Le même paramètre sert au test IS NULL et à la comparaison.
  const filtre = status ?? null

  const { rows: totalRows } = await db.query(
    `SELECT count(*)::int AS total FROM articles WHERE ($1::text IS NULL OR status = $1)`,
    [filtre]
  )
  const total = totalRows[0].total

  const { rows: articles } = await db.query(
    `SELECT
       id, slug, title, status,
       published_at AS "publishedAt", updated_at AS "updatedAt"
     FROM articles
     WHERE ($1::text IS NULL OR status = $1)
     ORDER BY updated_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [filtre, limit, (page - 1) * limit]
  )

  const tagsParArticle = await chargerTagsPour(db, articles.map((a) => a.id))
  return {
    data: articles.map((a) => ({ ...a, tags: tagsParArticle.get(a.id) ?? [] })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  }
}

// Crée les tags manquants puis les lie à l'article. À appeler dans une transaction.
// ON CONFLICT DO NOTHING : un tag existant est réutilisé, sans erreur ni transaction avortée.
export async function lierTags(client, articleId, tags) {
  if (tags.length === 0) return
  for (const { name, slug } of tags) {
    await client.query('INSERT INTO tags (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING', [name, slug])
  }
  await client.query(
    `INSERT INTO article_tags (article_id, tag_id)
     SELECT $1, id FROM tags WHERE slug = ANY($2::text[])`,
    [articleId, tags.map((t) => t.slug)]
  )
}

// Crée un brouillon, ses tags et leurs liens dans UNE transaction.
// Le slug est cherché avec ON CONFLICT DO NOTHING : un doublon ne fait pas échouer
// la transaction, on essaie simplement le suffixe suivant (-2, -3...).
export async function creerArticle(db, { authorId, title, contentMd, excerpt = '', coverUrl = null, tags = [] }) {
  const titre = title.trim()
  const base = slugifier(titre)
  const tagsNormalises = normaliserTags(tags)

  return enTransaction(db, async (client) => {
    let id = null
    for (let essai = 1; essai <= 10 && id === null; essai++) {
      const { rows } = await client.query(
        `INSERT INTO articles (title, slug, excerpt, content_md, cover_url, author_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [titre, slugAvecSuffixe(base, essai), excerpt, contentMd, coverUrl, authorId]
      )
      if (rows[0]) id = rows[0].id
    }
    if (id === null) throw conflit('Impossible de générer un slug unique')

    await lierTags(client, id, tagsNormalises)
    return id
  })
}

// Champs modifiables par PATCH → colonne SQL. Liste fermée : aucun nom de colonne ne vient du client.
const COLONNES_MODIFIABLES = {
  title: 'title',
  excerpt: 'excerpt',
  contentMd: 'content_md',
  coverUrl: 'cover_url',
}

// Modifie les champs reçus, et seulement eux, dans UNE transaction. `tags` REMPLACE la
// liste complète. Le slug ne change jamais. Renvoie false si l'article n'existe pas.
export async function modifierArticle(db, id, champs) {
  const affectations = ['updated_at = now()']
  const valeurs = [id]
  for (const [cle, colonne] of Object.entries(COLONNES_MODIFIABLES)) {
    if (!Object.hasOwn(champs, cle)) continue
    valeurs.push(cle === 'title' ? champs.title.trim() : champs[cle])
    affectations.push(`${colonne} = $${valeurs.length}`)
  }

  return enTransaction(db, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE articles SET ${affectations.join(', ')} WHERE id = $1`,
      valeurs
    )
    if (rowCount === 0) return false

    if (Object.hasOwn(champs, 'tags')) {
      await client.query('DELETE FROM article_tags WHERE article_id = $1', [id])
      await lierTags(client, id, normaliserTags(champs.tags))
    }
    return true
  })
}

// Publication et dépublication : idempotentes (docs/api.md §4). Une seule requête suffit,
// donc pas de transaction. Dans un UPDATE, les expressions lisent l'ANCIENNE ligne :
// `updated_at` ne bouge que si le statut change vraiment, et `published_at` garde sa
// première valeur pour toujours. Renvoient false si l'article n'existe pas.
export async function publierArticle(db, id) {
  const { rowCount } = await db.query(
    `UPDATE articles
     SET updated_at   = CASE WHEN status = 'published' THEN updated_at ELSE now() END,
         status       = 'published',
         published_at = COALESCE(published_at, now())
     WHERE id = $1`,
    [id]
  )
  return rowCount > 0
}

export async function depublierArticle(db, id) {
  const { rowCount } = await db.query(
    `UPDATE articles
     SET updated_at = CASE WHEN status = 'draft' THEN updated_at ELSE now() END,
         status     = 'draft'
     WHERE id = $1`,
    [id]
  )
  return rowCount > 0
}

// Les liens avec les tags disparaissent par cascade ; les tags eux-mêmes restent.
export async function supprimerArticle(db, id) {
  const { rowCount } = await db.query('DELETE FROM articles WHERE id = $1', [id])
  return rowCount > 0
}
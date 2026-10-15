import { slugifier, slugAvecSuffixe, normaliserTags } from './slug.js'
import { conflit } from './http-errors.js'
import { chargerTagsPour } from './tags.js'

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

// Crée un brouillon, ses tags et leurs liens dans UNE transaction (docs/api.md §7).
// Le slug est cherché avec ON CONFLICT DO NOTHING : un doublon ne fait pas échouer
// la transaction, on essaie simplement le suffixe suivant (-2, -3...).
export async function creerArticle(db, { authorId, title, contentMd, excerpt = '', coverUrl = null, tags = [] }) {
  const titre = title.trim()
  const base = slugifier(titre)
  const tagsNormalises = normaliserTags(tags)

  const client = await db.connect()
  try {
    await client.query('BEGIN')

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
    await client.query('COMMIT')
    return id
  } catch (err) {
    // Si la connexion est tombée, ROLLBACK échoue aussi : on ne doit pas masquer l'erreur d'origine.
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
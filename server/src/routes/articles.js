import { nonTrouve } from '../lib/http-errors.js'
import { chargerTagsPour } from '../lib/tags.js'


// Routes publiques de lecture des articles (voir docs/api.md §4).
// Un article en brouillon se comporte EXACTEMENT comme un article
// inexistant : même 404, même code d'erreur. On ne révèle jamais
// qu'un brouillon existe à un visiteur non connecté.

const tagSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    slug: { type: 'string' },
  },
}

// Schémas de réponse : Fastify ne sérialise QUE les champs listés ici,
// quoi que la requête SQL ramène par ailleurs. Une colonne sensible
// ajoutée par erreur plus tard (ex: password_hash via une jointure
// malheureuse) ne sortirait donc jamais de l'API par accident.
const articleResumeSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    title: { type: 'string' },
    excerpt: { type: 'string' },
    coverUrl: { type: ['string', 'null'] },
    publishedAt: { type: 'string' },
    readingTime: { type: 'integer' },
    tags: { type: 'array', items: tagSchema },
  },
}

const articleDetailSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    title: { type: 'string' },
    excerpt: { type: 'string' },
    contentMd: { type: 'string' },
    coverUrl: { type: ['string', 'null'] },
    publishedAt: { type: 'string' },
    updatedAt: { type: 'string' },
    readingTime: { type: 'integer' },
    tags: { type: 'array', items: tagSchema },
  },
}

export default async function articlesRoutes(app) {
  app.get(
    '/api/articles',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: articleResumeSchema },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { page, limit } = request.query
      const offset = (page - 1) * limit

      const { rows: totalRows } = await app.db.query(
        `SELECT count(*)::int AS total FROM articles WHERE status = 'published'`
      )
      const total = totalRows[0].total

      const { rows: articles } = await app.db.query(
        `SELECT
           id, slug, title, excerpt, cover_url AS "coverUrl",
           published_at AS "publishedAt",
           GREATEST(1, round(char_length(content_md) / 1100.0))::int AS "readingTime"
         FROM articles
         WHERE status = 'published'
         ORDER BY published_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      )

      const tagsParArticle = await chargerTagsPour(app.db, articles.map((a) => a.id))
      const data = articles.map(({ id, ...reste }) => ({ ...reste, tags: tagsParArticle.get(id) ?? [] }))

      return {
        data,
        meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      }
    }
  )

  app.get(
    '/api/articles/:slug',
    {
      schema: {
        params: {
          type: 'object',
          required: ['slug'],
          properties: { slug: { type: 'string' } },
        },
        response: {
          200: articleDetailSchema,
        },
      },
    },
    async (request) => {
      const { rows } = await app.db.query(
        `SELECT
           id, slug, title, excerpt, content_md AS "contentMd", cover_url AS "coverUrl",
           published_at AS "publishedAt", updated_at AS "updatedAt",
           GREATEST(1, round(char_length(content_md) / 1100.0))::int AS "readingTime"
         FROM articles
         WHERE slug = $1 AND status = 'published'`,
        [request.params.slug]
      )
      const article = rows[0]
      if (!article) {
        throw nonTrouve('Article introuvable')
      }

      const tagsParArticle = await chargerTagsPour(app.db, [article.id])
      const { id, ...reste } = article
      return { ...reste, tags: tagsParArticle.get(id) ?? [] }
    }
  )
}
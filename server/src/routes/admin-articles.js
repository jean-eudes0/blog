import { nonTrouve } from '../lib/http-errors.js'
import {
  chargerArticleAdmin,
  creerArticle,
  depublierArticle,
  listerArticlesAdmin,
  modifierArticle,
  publierArticle,
  supprimerArticle,
} from '../lib/articles-admin.js'

const tagSchema = {
  type: 'object',
  properties: { name: { type: 'string' }, slug: { type: 'string' } },
}

// Sortie admin complète. author_id n'y figure pas : le schéma de réponse le filtrerait de toute façon.
const articleAdminSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    slug: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string' },
    excerpt: { type: 'string' },
    contentMd: { type: 'string' },
    coverUrl: { type: ['string', 'null'] },
    publishedAt: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    readingTime: { type: 'integer' },
    tags: { type: 'array', items: tagSchema },
  },
}

// Un élément de la liste : pas de contenu, pas d'extrait (docs/api.md §4).
const articleListeSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    slug: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string' },
    publishedAt: { type: ['string', 'null'] },
    updatedAt: { type: 'string' },
    tags: { type: 'array', items: tagSchema },
  },
}

// Règles de docs/api.md §6, sous forme d'UN SEUL pattern par champ (Ajv n'en accepte qu'un).
// Chaque pattern refuse aussi le caractère NUL (U+0000), qui ferait échouer PostgreSQL :
// sans cela, il partirait en 500 au lieu d'un 400.
//   - non vide : au moins un caractère qui n'est pas un espace ;
//   - coverUrl : commence par http:// ou https:// (jamais javascript: ni data: : faille XSS).
// Les mêmes champs servent à la création (POST) et à la modification (PATCH).
const SANS_NUL = '^[^\\u0000]*$'
const NON_VIDE_SANS_NUL = '^(?=[\\s\\S]*\\S)[^\\u0000]*$'
const URL_HTTP_SANS_NUL = '^https?://[^\\u0000]*$'

const champsArticle = {
  title: { type: 'string', minLength: 1, maxLength: 150, pattern: NON_VIDE_SANS_NUL },
  excerpt: { type: 'string', maxLength: 300, pattern: SANS_NUL },
  contentMd: { type: 'string', minLength: 1, maxLength: 100000, pattern: NON_VIDE_SANS_NUL },
  coverUrl: { type: ['string', 'null'], maxLength: 500, pattern: URL_HTTP_SANS_NUL },
  tags: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 30, pattern: SANS_NUL } },
}

// Entier PostgreSQL (int4) : au-delà de 2147483647, la requête SQL échouerait en 500.
const paramsId = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1, maximum: 2147483647 } },
}

// Routes réservées à l'admin (docs/api.md §4). Le hook onRequest tourne AVANT la
// validation : une requête sans session reçoit 401, jamais 400.
export default async function adminArticlesRoutes(app) {
  app.get(
    '/api/admin/articles',
    {
      onRequest: app.exigerSession,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            status: { type: 'string', enum: ['draft', 'published'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: articleListeSchema },
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
    async (request) => listerArticlesAdmin(app.db, request.query)
  )

  app.get(
    '/api/admin/articles/:id',
    {
      onRequest: app.exigerSession,
      schema: { params: paramsId, response: { 200: articleAdminSchema } },
    },
    async (request) => {
      const article = await chargerArticleAdmin(app.db, request.params.id)
      if (!article) throw nonTrouve('Article introuvable')
      return article
    }
  )

  app.post(
    '/api/admin/articles',
    {
      onRequest: app.exigerSession,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'contentMd'],
          properties: champsArticle,
        },
        response: { 201: articleAdminSchema },
      },
    },
    async (request, reply) => {
      const id = await creerArticle(app.db, { authorId: request.user.id, ...request.body })
      const article = await chargerArticleAdmin(app.db, id)
      return reply.code(201).header('Location', `/api/admin/articles/${id}`).send(article)
    }
  )

  // Tous les champs sont optionnels, mais il en faut au moins un (minProperties).
  // slug, status, publishedAt, id et authorId sont refusés par additionalProperties: false.
  app.patch(
    '/api/admin/articles/:id',
    {
      onRequest: app.exigerSession,
      schema: {
        params: paramsId,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: champsArticle,
        },
        response: { 200: articleAdminSchema },
      },
    },
    async (request) => {
      const trouve = await modifierArticle(app.db, request.params.id, request.body)
      if (!trouve) throw nonTrouve('Article introuvable')
      return chargerArticleAdmin(app.db, request.params.id)
    }
  )

  // Le statut ne se change que par ces deux actions, jamais par PATCH (docs/api.md §4).
  function routeAction(chemin, action) {
    app.post(
      `/api/admin/articles/:id/${chemin}`,
      {
        onRequest: app.exigerSession,
        schema: { params: paramsId, response: { 200: articleAdminSchema } },
      },
      async (request) => {
        const trouve = await action(app.db, request.params.id)
        if (!trouve) throw nonTrouve('Article introuvable')
        return chargerArticleAdmin(app.db, request.params.id)
      }
    )
  }
  routeAction('publish', publierArticle)
  routeAction('unpublish', depublierArticle)

  app.delete(
    '/api/admin/articles/:id',
    {
      onRequest: app.exigerSession,
      schema: { params: paramsId },
    },
    async (request, reply) => {
      const trouve = await supprimerArticle(app.db, request.params.id)
      if (!trouve) throw nonTrouve('Article introuvable')
      return reply.code(204).send()
    }
  )
}
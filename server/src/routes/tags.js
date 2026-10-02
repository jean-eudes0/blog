// Tags qui ont au moins un article publié, avec leur compteur.
// Un tag qui n'existe que sur des brouillons n'apparaît pas ici,
// pour la même raison qu'un brouillon reste invisible : rien ne doit
// laisser deviner son existence à un visiteur non connecté.

export default async function tagsRoutes(app) {
  app.get(
    '/api/tags',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string' },
                    articleCount: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const { rows } = await app.db.query(`
        SELECT t.name, t.slug, count(a.id)::int AS "articleCount"
        FROM tags t
        JOIN article_tags at ON at.tag_id = t.id
        JOIN articles a ON a.id = at.article_id AND a.status = 'published'
        GROUP BY t.id
        ORDER BY t.name
      `)
      return { data: rows }
    }
  )
}
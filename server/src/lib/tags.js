// Charger les tqgs de plusieurs articles en une seule requête (pas une 
// requête par article), à partir de leurs id internes.
// Partagé par les routes publiques et par les routes admin.
export async function chargerTagsPour(db, articleIds) {
  const map = new Map()
  if (articleIds.length === 0) return map

  const { rows } = await db.query(
    `SELECT at.article_id AS "articleId", t.name, t.slug
     FROM article_tags at
     JOIN tags t ON t.id = at.tag_id
     WHERE at.article_id = ANY($1::int[])
     ORDER BY t.name`,
    [articleIds]
  )

  for (const row of rows) {
    const liste = map.get(row.articleId) ?? []
    liste.push({ name: row.name, slug: row.slug })
    map.set(row.articleId, liste)
  }
  return map
}
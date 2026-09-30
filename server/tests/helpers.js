import { openDb } from '../src/db.js'

// Un seul pool est partagé par fichier de test (réel PostgreSQL, pas de
// base "en mémoire" possible comme avec SQLite). resetDb() vide les
// tables entre chaque test pour que les tests restent indépendants.
export async function getTestDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL doit pointer vers une base PostgreSQL de test (ex: postgresql://postgres:test@localhost/blog_test)'
    )
  }
  return openDb(url)
}

export async function resetDb(db) {
  await db.query('TRUNCATE users, articles, tags, article_tags, sessions RESTART IDENTITY CASCADE')
}
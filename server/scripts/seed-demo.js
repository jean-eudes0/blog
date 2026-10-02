// Jeu de données de démonstration pour développer et tester les routes
// de lecture publique (étape 3), avant que la vraie authentification et
// la création d'articles n'existent (étape 4-5).
//
// L'utilisateur créé ici n'est PAS un vrai compte : son mot de passe est
// un texte fixe qui n'est pas un hash bcrypt valide, donc aucune tentative
// de connexion ne pourra jamais aboutir avec lui. Il a le rôle "author"
// (aucun pouvoir). Chaque article est inséré avec ses tags dans UNE
// transaction : un plantage ne laisse jamais un article sans ses tags.
// Le script refuse de tourner en production.
//
// Usage : npm run seed

import { loadConfig } from '../src/config.js'
import { openDb } from '../src/db.js'
import { slugify } from '../src/lib/slug.js'

const EMAIL_DEMO = 'demo@exemple.local'
const HASH_FACTICE = 'DEMO_NE_PEUT_PAS_SERVIR_A_SE_CONNECTER'
const MS_PAR_JOUR = 86_400_000

const articles = [
  {
    slug: 'mon-premier-tp-fastify',
    title: 'Mon premier TP Fastify',
    excerpt: "Ce que j'ai compris en montant une API avec Fastify, et ce qui m'a bloqué.",
    contentMd:
      '# Mon premier TP Fastify\n\nCe TP m\'a fait découvrir les routes, les schémas de validation ' +
      'et la gestion des sessions. Ce qui m\'a le plus bloqué : comprendre quand Fastify valide le ' +
      'corps de la requête par rapport à quand mon propre code s\'exécute.\n',
    tags: ['fastify', 'backend'],
    joursDepuisPublication: 10,
  },
  {
    slug: 'migrer-sqlite-vers-postgresql',
    title: 'Pourquoi j\'ai migré de SQLite vers PostgreSQL',
    excerpt: 'Le choix d\'hébergement gratuit qui m\'a fait changer de base de données en pleine étape 2.',
    contentMd:
      '# Pourquoi j\'ai migré de SQLite vers PostgreSQL\n\nSQLite stocke tout dans un fichier, ce qui ' +
      'pose un vrai problème sur un hébergeur gratuit sans disque persistant. PostgreSQL géré ' +
      '(Neon) résout ça sans coût.\n',
    tags: ['postgresql', 'backend', 'déploiement'],
    joursDepuisPublication: 3,
  },
  {
    slug: 'comprendre-les-courses-entre-tests',
    title: 'Comprendre les courses (race conditions) entre mes tests',
    excerpt: 'Deux fichiers de test qui partagent la même base peuvent se marcher dessus. Voici comment je l\'ai vu.',
    contentMd:
      '# Comprendre les courses entre mes tests\n\nMes deux fichiers de test tournaient en parallèle ' +
      'et partageaient la même base PostgreSQL. Le TRUNCATE de l\'un pouvait vider les données que ' +
      'l\'autre venait juste d\'insérer. La solution : --test-concurrency=1.\n',
    tags: ['tests', 'postgresql'],
    joursDepuisPublication: 1,
  },
  {
    slug: 'brouillon-pas-encore-publie',
    title: 'Un brouillon que je ne suis pas prêt à publier',
    excerpt: 'Ceci ne doit jamais apparaître sur le blog public.',
    contentMd: '# Brouillon\n\nCeci est un brouillon, il ne doit pas être visible publiquement.\n',
    tags: ['brouillon'],
    statut: 'draft',
  },
]

async function obtenirOuCreerUtilisateurDemo(db) {
  const { rows } = await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [EMAIL_DEMO])
  if (rows[0]) return rows[0].id

  const { rows: inserted } = await db.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'author') RETURNING id`,
    [EMAIL_DEMO, HASH_FACTICE]
  )
  return inserted[0].id
}

async function obtenirOuCreerTag(client, nom) {
  const slug = slugify(nom)
  const { rows } = await client.query('SELECT id FROM tags WHERE slug = $1', [slug])
  if (rows[0]) return rows[0].id

  const { rows: inserted } = await client.query(
    'INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id',
    [nom, slug]
  )
  return inserted[0].id
}

async function creerArticleDemo(db, article, authorId) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows: existant } = await client.query('SELECT id FROM articles WHERE slug = $1', [article.slug])
    if (existant[0]) {
      await client.query('ROLLBACK')
      console.log(`déjà présent : ${article.slug}`)
      return
    }

    const statut = article.statut ?? 'published'
    const publishedAt =
      statut === 'published'
        ? new Date(Date.now() - article.joursDepuisPublication * MS_PAR_JOUR)
        : null

    const { rows: insere } = await client.query(
      `INSERT INTO articles (title, slug, excerpt, content_md, status, published_at, author_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [article.title, article.slug, article.excerpt, article.contentMd, statut, publishedAt, authorId]
    )
    const articleId = insere[0].id

    for (const nomTag of article.tags) {
      const tagId = await obtenirOuCreerTag(client, nomTag)
      await client.query(
        'INSERT INTO article_tags (article_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [articleId, tagId]
      )
    }

    await client.query('COMMIT')
    console.log(`créé : ${article.slug}`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function seed() {
  const config = loadConfig()
  if (config.nodeEnv === 'production') {
    throw new Error('Le seed de démonstration ne doit jamais tourner en production.')
  }

  const db = await openDb(config.databaseUrl)
  try {
    const authorId = await obtenirOuCreerUtilisateurDemo(db)
    for (const article of articles) {
      await creerArticleDemo(db, article, authorId)
    }
    console.log('Terminé.')
  } finally {
    await db.end()
  }
}

seed().catch((err) => {
  console.error('Échec du seed :', err)
  process.exit(1)
})
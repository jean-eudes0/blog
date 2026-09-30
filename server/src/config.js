function entierPositif(valeur, nomVariable, defaut) {
  if (valeur === undefined) return defaut
  const n = Number(valeur)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${nomVariable} doit être un entier positif (reçu: "${valeur}")`)
  }
  return n
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development'
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(`NODE_ENV invalide: "${nodeEnv}" (attendu: development, production ou test)`)
  }

  const port = entierPositif(env.PORT, 'PORT', 3000)

  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL est obligatoire (ex: postgresql://user:pass@host/dbname). ' +
        'Neon et Supabase la fournissent dans leur tableau de bord.'
    )
  }
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error(`DATABASE_URL ne ressemble pas à une URL PostgreSQL: "${databaseUrl}"`)
  }

  const publicUrl = env.PUBLIC_URL ?? (nodeEnv === 'production' ? undefined : 'http://localhost:5173')
  if (!publicUrl) {
    throw new Error('PUBLIC_URL est obligatoire en production (ex: https://mon-blog.exemple.com)')
  }
  try {
    new URL(publicUrl)
  } catch {
    throw new Error(`PUBLIC_URL n'est pas une URL valide: "${publicUrl}"`)
  }

  return { nodeEnv, port, databaseUrl, publicUrl }
}

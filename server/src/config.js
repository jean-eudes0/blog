// Lit et valide la configuration depuis les variables d'environnement.
// Le serveur refuse de démarrer si quelque chose d'important manque ou
// est invalide : mieux vaut planter ici, avec un message clair, plutôt
// que plus tard avec une erreur obscure.

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
  const dbFile = env.DB_FILE ?? (nodeEnv === 'production' ? undefined : 'blog.db')
  if (!dbFile) {
    throw new Error('DB_FILE est obligatoire en production')
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

  return { nodeEnv, port, dbFile, publicUrl }
}

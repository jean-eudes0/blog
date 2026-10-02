// Lit et valide la configuration. Toutes les erreurs sont collectées puis
// signalées ensemble, pour qu'on les corrige en une seule fois.
export function loadConfig(env = process.env) {
  const erreurs = []

  const nodeEnv = env.NODE_ENV ?? 'development'
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    erreurs.push(`NODE_ENV invalide: "${nodeEnv}" (attendu: development, production ou test)`)
  }

  let port = 3000
  if (env.PORT !== undefined) {
    const n = Number(env.PORT)
    if (Number.isInteger(n) && n > 0) port = n
    else erreurs.push(`PORT doit être un entier positif (reçu: "${env.PORT}")`)
  }

  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) {
    erreurs.push(
      'DATABASE_URL est obligatoire (ex: postgresql://user:pass@host/dbname). ' +
        'Neon et Supabase la fournissent dans leur tableau de bord.'
    )
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    // On n'affiche jamais la valeur : elle peut contenir un mot de passe.
    erreurs.push('DATABASE_URL doit commencer par postgresql:// (ou postgres://)')
  }

  const publicUrl = env.PUBLIC_URL ?? (nodeEnv === 'production' ? undefined : 'http://localhost:5173')
  if (!publicUrl) {
    erreurs.push('PUBLIC_URL est obligatoire en production (ex: https://mon-blog.exemple.com)')
  } else {
    try {
      new URL(publicUrl)
    } catch {
      erreurs.push(`PUBLIC_URL n'est pas une URL valide: "${publicUrl}"`)
    }
  }

  if (erreurs.length > 0) {
    throw new Error(`configuration invalide :\n  - ${erreurs.join('\n  - ')}`)
  }

  return { nodeEnv, port, databaseUrl, publicUrl }
}
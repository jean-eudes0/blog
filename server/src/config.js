import { isIP } from 'node:net'

// "10.0.0.1", "::1", "10.0.0.0/8" : une vraie adresse IP, avec ou sans longueur de préfixe.
// (Une simple regex laissait passer "1" ou "abc", que Fastify refuse ensuite au démarrage.)
function estAdresseOuPlage(texte) {
  const [adresse, prefixe, ...reste] = texte.split('/')
  const version = isIP(adresse)
  if (version === 0 || reste.length > 0) return false
  if (prefixe === undefined) return true
  const max = version === 4 ? 32 : 128
  return /^\d{1,3}$/.test(prefixe) && Number(prefixe) <= max
}

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

  // Proxys de confiance (voir docs/api.md §8) : liste d'adresses, de plages CIDR ou de
  // noms (loopback, linklocal, uniquelocal), séparés par des virgules. Vide = aucun.
  // Un NOMBRE de sauts ne marche pas : Fastify refuse alors de faire confiance à tout
  // le monde, par sécurité, et l'adresse IP du visiteur reste celle du proxy.
  let trustProxy = false
  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY.trim() !== '') {
    const elements = env.TRUST_PROXY.split(',').map((e) => e.trim())
    const valide = (e) => ['loopback', 'linklocal', 'uniquelocal'].includes(e) || estAdresseOuPlage(e)
    const invalides = elements.filter((e) => !valide(e))
    if (invalides.length === 0) {
      trustProxy = elements.join(',')
    } else {
      // On nomme les éléments fautifs (jamais la liste entière) : la valeur n'a rien de secret,
      // mais une valeur collée de travers peut être très longue.
      const apercu = invalides
        .slice(0, 3)
        .map((e) => JSON.stringify(e.length > 40 ? `${e.slice(0, 40)}…` : e))
        .join(', ')
      const suite = invalides.length > 3 ? ` (et ${invalides.length - 3} autre(s))` : ''
      let conseil = ''
      if (invalides.some((e) => /^TRUST_PROXY\s*=/.test(e))) conseil = ' Colle seulement la valeur, sans « TRUST_PROXY= ».'
      else if (invalides.some((e) => /["'`]/.test(e))) conseil = ' Retire les guillemets autour de la valeur.'
      erreurs.push(
        `TRUST_PROXY contient des éléments invalides : ${apercu}${suite}.${conseil} ` +
          "Attendu : une liste, séparée par des virgules, d'adresses IP, de plages CIDR ou de noms " +
          '(loopback, linklocal, uniquelocal). Un nombre de sauts ne fonctionne pas.'
      )
    }
  }

  if (erreurs.length > 0) {
    throw new Error(`configuration invalide :\n  - ${erreurs.join('\n  - ')}`)
  }

  return { nodeEnv, port, databaseUrl, publicUrl, trustProxy }
}
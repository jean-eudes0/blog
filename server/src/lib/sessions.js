import { createHash, randomBytes } from 'node:crypto'

// Sessions opaques stockées en base (voir docs/api.md §2).
// Le jeton envoyé au navigateur est aléatoire ; la base ne garde que son
// empreinte SHA-256. Une fuite de la base ne donne donc aucune session utilisable.

export const NOM_COOKIE = 'sid'
export const DUREE_SESSION_SECONDES = 7 * 24 * 60 * 60

export function empreinte(jeton) {
  return createHash('sha256').update(jeton).digest('hex')
}

// Crée une NOUVELLE session pour l'utilisateur et renvoie le jeton en clair.
// Les dates sont calculées par la base (now()) : pas de décalage d'horloge
// entre le serveur applicatif et PostgreSQL.
export async function creerSession(db, userId) {
  const jeton = randomBytes(32).toString('base64url')
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [empreinte(jeton), userId, DUREE_SESSION_SECONDES]
  )
  return jeton
}

// Renvoie { id, email, role } si le jeton correspond à une session non expirée,
// sinon null.
export async function trouverUtilisateur(db, jeton) {
  if (typeof jeton !== 'string' || jeton.length === 0 || jeton.length > 200) return null
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [empreinte(jeton)]
  )
  return rows[0] ?? null
}

// Révocation immédiate. Sans effet si la session n'existe pas (idempotent).
export async function supprimerSession(db, jeton) {
  if (typeof jeton !== 'string' || jeton.length === 0 || jeton.length > 200) return
  await db.query('DELETE FROM sessions WHERE id = $1', [empreinte(jeton)])
}

// Supprime les sessions expirées et renvoie leur nombre.
export async function purgerSessionsExpirees(db) {
  const { rowCount } = await db.query('DELETE FROM sessions WHERE expires_at < now()')
  return rowCount
}
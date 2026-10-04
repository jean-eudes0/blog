import bcrypt from 'bcryptjs'

export const COUT_BCRYPT = 12
export const MOT_DE_PASSE_MIN = 12
// bcrypt ignore silencieusement tout ce qui dépasse 72 OCTETS (pas caractères :
// un accent en pèse 2). On refuse plutôt que de tronquer sans le dire.
export const MOT_DE_PASSE_MAX_OCTETS = 72

// Erreur dont le message est destiné à être lu par la personne qui lance le script.
export class ErreurValidation extends Error {}

export function validerEmail(email) {
  const propre = String(email ?? '').trim().toLowerCase()
  if (propre.length === 0 || propre.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(propre)) {
    throw new ErreurValidation(`Adresse e-mail invalide : "${email ?? ''}"`)
  }
  return propre
}

export function validerMotDePasse(motDePasse) {
  const mdp = String(motDePasse ?? '')
  if ([...mdp].length < MOT_DE_PASSE_MIN) {
    throw new ErreurValidation(`Le mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`)
  }
  if (Buffer.byteLength(mdp, 'utf8') > MOT_DE_PASSE_MAX_OCTETS) {
    throw new ErreurValidation(
      `Le mot de passe dépasse ${MOT_DE_PASSE_MAX_OCTETS} octets (un caractère accentué en pèse 2). ` +
        'Raccourcis-le : bcrypt ignorerait le reste.'
    )
  }
  return mdp
}

// Crée le compte admin. L'e-mail est enregistré en minuscules.
export async function creerAdmin(db, email, motDePasse, { cout = COUT_BCRYPT } = {}) {
  const emailPropre = validerEmail(email)
  const mdp = validerMotDePasse(motDePasse)
  const hash = await bcrypt.hash(mdp, cout)
  try {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
       RETURNING id, email, role`,
      [emailPropre, hash]
    )
    return rows[0]
  } catch (err) {
    if (err.code === '23505') throw new ErreurValidation(`Un compte existe déjà avec l'adresse ${emailPropre}.`)
    throw err
  }
}
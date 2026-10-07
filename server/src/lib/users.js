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

// Hash bcrypt valide mais qui ne correspond à aucun mot de passe : sert à faire
// le même travail (et donc prendre le même temps) quand l'e-mail est inconnu.
let hashFactice
function obtenirHashFactice() {
  hashFactice ??= bcrypt.hash('mot-de-passe-qui-ne-sera-jamais-valide', COUT_BCRYPT)
  return hashFactice
}

const FORME_HASH_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

export async function trouverParEmail(db, email) {
  const { rows } = await db.query(
    'SELECT id, email, role, password_hash FROM users WHERE lower(email) = $1',
    [String(email).trim().toLowerCase()]
  )
  return rows[0] ?? null
}

// Compare le mot de passe au hash. Fait TOUJOURS exactement une comparaison bcrypt,
// même si le hash est absent (e-mail inconnu) ou n'est pas un vrai hash (compte de
// démonstration) : le temps de réponse ne révèle donc rien sur l'existence du compte.
export async function verifierMotDePasse(motDePasse, hash) {
  const hashUtilisable = typeof hash === 'string' && FORME_HASH_BCRYPT.test(hash)
  const cible = hashUtilisable ? hash : await obtenirHashFactice()
  const correspond = await bcrypt.compare(String(motDePasse), cible)
  // bcrypt ignore ce qui dépasse 72 octets : sans cette règle, un mot de passe plus
  // long mais qui commence comme le vrai serait accepté.
  const tropLong = Buffer.byteLength(String(motDePasse), 'utf8') > MOT_DE_PASSE_MAX_OCTETS
  return hashUtilisable && correspond && !tropLong
}
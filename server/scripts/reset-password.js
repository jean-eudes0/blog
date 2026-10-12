// Remplace le mot de passe d'un compte EXISTANT (docs/api.md §2 : pas de
// réinitialisation par e-mail en V1).
//
// Usage (PowerShell) :
//   "$p`n$p" | node --env-file=.env scripts/reset-password.js moi@exemple.com
//
// Le mot de passe arrive par l'entrée standard (saisi deux fois), jamais en
// argument : il n'apparaît ni dans l'historique du terminal ni dans la liste des
// processus. Les sessions ouvertes du compte sont supprimées : un cookie créé
// avec l'ancien mot de passe cesse de fonctionner immédiatement.

import readline from 'node:readline'
import bcrypt from 'bcryptjs'
import { loadConfig } from '../src/config.js'
import { openDb } from '../src/db.js'
import { COUT_BCRYPT, ErreurValidation, validerEmail, validerMotDePasse } from '../src/lib/users.js'

async function lireDeuxLignes() {
  if (process.stdin.isTTY) {
    throw new ErreurValidation('Envoie le mot de passe deux fois par un tube : "$p`n$p" | node scripts/reset-password.js adresse@exemple.com')
  }
  const rl = readline.createInterface({ input: process.stdin })
  const lignes = []
  for await (const ligne of rl) {
    lignes.push(ligne)
    if (lignes.length === 2) break
  }
  rl.close()
  return lignes
}

async function main() {
  if (!process.argv[2]) {
    throw new ErreurValidation('Usage : "$p`n$p" | node scripts/reset-password.js adresse@exemple.com')
  }
  const email = validerEmail(process.argv[2])

  const [saisie, confirmation] = await lireDeuxLignes()
  if (saisie !== confirmation) throw new ErreurValidation('Les deux mots de passe sont différents.')
  const hash = await bcrypt.hash(validerMotDePasse(saisie), COUT_BCRYPT)

  const config = loadConfig()
  const db = await openDb(config.databaseUrl)
  try {
    const { rows } = await db.query(
      'UPDATE users SET password_hash = $2 WHERE lower(email) = $1 RETURNING id, email',
      [email, hash]
    )
    if (rows.length === 0) {
      throw new ErreurValidation(`Aucun compte avec l'adresse ${email}. Crée-le avec : npm run create-admin -- ${email}`)
    }
    const { rowCount } = await db.query('DELETE FROM sessions WHERE user_id = $1', [rows[0].id])
    console.log(`Mot de passe remplacé pour ${rows[0].email} (id ${rows[0].id}). Sessions fermées : ${rowCount}.`)
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  if (err instanceof ErreurValidation) {
    console.error(err.message)
  } else {
    console.error(`Échec : ${err.message}`)
  }
  process.exit(1)
})
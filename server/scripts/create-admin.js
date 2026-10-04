// Crée le compte admin (il n'y a pas d'inscription publique : voir docs/api.md §2).
// Usage : npm run create-admin -- moi@exemple.com
// Le mot de passe est demandé au clavier, jamais passé en argument, pour qu'il
// n'apparaisse ni dans l'historique du terminal ni dans la liste des processus.

import readline from 'node:readline'
import { loadConfig } from '../src/config.js'
import { openDb } from '../src/db.js'
import { creerAdmin, validerEmail, ErreurValidation } from '../src/lib/users.js'

// Saisie sans écho dans un vrai terminal.
function lireMotDePasseCache(invite) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    stdout.write(invite)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let saisie = ''

    const terminer = () => {
      stdin.removeListener('data', surDonnees)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
    }
    const surDonnees = (morceau) => {
      for (const c of morceau) {
        if (c === '\r' || c === '\n') {
          terminer()
          resolve(saisie)
          return
        }
        if (c === '\u0003') {
          terminer()
          process.exit(130)
        }
        if (c === '\u007f' || c === '\b') {
          saisie = [...saisie].slice(0, -1).join('')
        } else if (c >= ' ') {
          saisie += c
        }
      }
    }
    stdin.on('data', surDonnees)
  })
}

// Entrée redirigée (tests automatiques) : une ligne par question.
function creerLecteurLignes() {
  const rl = readline.createInterface({ input: process.stdin })
  const lignes = rl[Symbol.asyncIterator]()
  return {
    async demander(invite) {
      process.stdout.write(invite)
      const { value } = await lignes.next()
      process.stdout.write('\n')
      return value ?? ''
    },
    fermer: () => rl.close(),
  }
}

async function main() {
  const emailSaisi = process.argv[2]
  if (!emailSaisi) {
    throw new ErreurValidation('Usage : npm run create-admin -- adresse@exemple.com')
  }
  validerEmail(emailSaisi)

  const config = loadConfig()
  const lecteur = process.stdin.isTTY
    ? { demander: lireMotDePasseCache, fermer() {} }
    : creerLecteurLignes()

  const db = await openDb(config.databaseUrl)
  try {
    const mdp = await lecteur.demander('Mot de passe (12 caractères minimum) : ')
    const confirmation = await lecteur.demander('Confirme le mot de passe : ')
    lecteur.fermer()
    if (mdp !== confirmation) throw new ErreurValidation('Les deux mots de passe sont différents.')

    const admin = await creerAdmin(db, emailSaisi, mdp)
    console.log(`Compte admin créé : ${admin.email} (id ${admin.id})`)
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
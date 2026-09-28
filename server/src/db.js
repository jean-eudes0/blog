import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dossier = path.dirname(fileURLToPath(import.meta.url))
const dossierMigrations = path.join(dossier, '..', 'migrations')

export function openDb(fichier = 'blog.db') {
  const db = new Database(fichier)
  db.pragma('foreign_keys = ON')
  migrer(db)
  return db
}

function migrer(db) {
  const fichiers = readdirSync(dossierMigrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const versionActuelle = db.pragma('user_version', { simple: true })

  fichiers.forEach((fichier, i) => {
    const version = i + 1
    if (version <= versionActuelle) return
    db.transaction(() => {
      db.exec(readFileSync(path.join(dossierMigrations, fichier), 'utf8'))
      db.pragma(`user_version = ${version}`)
    })()
    console.log(`Migration appliquée : ${fichier}`)
  })
}
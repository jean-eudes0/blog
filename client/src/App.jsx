import { useEffect, useState } from 'react'
import { listerArticles } from './lib/api.js'

export default function App() {
  const [etat, setEtat] = useState({ statut: 'chargement' })

  useEffect(() => {
    const controle = new AbortController()
    listerArticles({ page: 1, limit: 10 }, controle.signal)
      .then((resultat) => setEtat({ statut: 'ok', resultat }))
      .catch((erreur) => {
        if (erreur.name === 'AbortError') return
        setEtat({ statut: 'erreur', erreur })
      })
    return () => controle.abort()
  }, [])

  return (
    <main>
      <h1>Blog</h1>
      {etat.statut === 'chargement' && <p>Chargement…</p>}
      {etat.statut === 'erreur' && <p role="alert">Erreur : {etat.erreur.message}</p>}
      {etat.statut === 'ok' && etat.resultat.data.length === 0 && <p>Aucun article pour l’instant.</p>}
      {etat.statut === 'ok' && (
        <ul>
          {etat.resultat.data.map((article) => (
            <li key={article.slug}>{article.title}</li>
          ))}
        </ul>
      )}
    </main>
  )
}
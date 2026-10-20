import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listerArticles } from '../lib/api.js'
import { formaterDate } from '../lib/dates.js'

const PAR_PAGE = 10

// Un numéro invalide dans l'URL (page=abc, page=0) retombe sur la page 1.
function lirePage(valeur) {
  const n = Number.parseInt(valeur ?? '1', 10)
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1
}

function lienPage(numero) {
  return numero === 1 ? '/' : `/?page=${numero}`
}



export default function Accueil() {
  const [params] = useSearchParams()
  const page = lirePage(params.get('page'))
  const [etat, setEtat] = useState({ page: null })

  useEffect(() => {
    const controle = new AbortController()
    listerArticles({ page, limit: PAR_PAGE }, controle.signal)
      .then((resultat) => setEtat({ page, resultat }))
      .catch((erreur) => {
        if (erreur.name === 'AbortError') return
        setEtat({ page, erreur })
      })
    return () => controle.abort()
  }, [page])

  const chargement = etat.page !== page
  const { resultat, erreur } = etat

  return (
    <>
      <h1>Articles</h1>
      {chargement && <p>Chargement…</p>}
      {!chargement && erreur && <p role="alert">Erreur : {erreur.message}</p>}
      {!chargement && resultat && <Liste resultat={resultat} page={page} />}
    </>
  )
}

function Liste({ resultat, page }) {
  const { data, meta } = resultat

  if (data.length === 0) {
    return page > 1 ? (
      <p>
        Cette page n’existe pas. <Link to="/">Retour à la première page</Link>
      </p>
    ) : (
      <p>Aucun article pour l’instant.</p>
    )
  }

  return (
    <>
      <ul className="liste-articles">
        {data.map((article) => (
          <li key={article.slug}>
            <h2>
              <Link to={`/articles/${article.slug}`}>{article.title}</Link>
            </h2>
            <p className="meta">
              {formaterDate(article.publishedAt)} · {article.readingTime} min de lecture
              {article.tags.length > 0 && ` · ${article.tags.map((t) => t.name).join(', ')}`}
            </p>
            {article.excerpt && <p>{article.excerpt}</p>}
          </li>
        ))}
      </ul>
      {meta.totalPages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          {page > 1 ? <Link to={lienPage(page - 1)}>← Précédent</Link> : <span />}
          <span>
            Page {meta.page} sur {meta.totalPages}
          </span>
          {page < meta.totalPages ? <Link to={lienPage(page + 1)}>Suivant →</Link> : <span />}
        </nav>
      )}
    </>
  )
}
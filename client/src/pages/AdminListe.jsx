import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import {
  depublierArticle,
  listerArticlesAdmin,
  publierArticle,
  supprimerArticle,
} from '../lib/api.js'
import { formaterDateHeure } from '../lib/dates.js'
import { messageErreur } from '../lib/messages-erreur.js'

// Un numéro invalide dans l'URL (page=abc, page=0) retombe sur la page 1.
function lirePage(valeur) {
  const n = Number.parseInt(valeur ?? '1', 10)
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1
}

function lire(valeur) {
  return valeur === 'draft' || valeur === 'published' ? valeur : undefined
}

function lien(page, status) {
  const requete = new URLSearchParams()
  if (status) requete.set('status', status)
  if (page > 1) requete.set('page', page)
  const texte = requete.toString()
  return texte ? `/admin?${texte}` : '/admin'
}

const FILTRES = [
  { status: undefined, nom: 'Tous' },
  { status: 'draft', nom: 'Brouillons' },
  { status: 'published', nom: 'Publiés' },
]

export default function AdminListe() {
  const { expirerSession } = useAuth()
  const [params] = useSearchParams()
  const page = lirePage(params.get('page'))
  const status = lire(params.get('status'))

  // `vue` = quelle liste (page + filtre) ; `version` monte après chaque action pour recharger
  // la MÊME vue sans la faire clignoter : l'ancienne liste reste affichée pendant le rechargement.
  const vue = `${page}|${status ?? ''}`
  const [version, setVersion] = useState(0)
  const cle = `${vue}|${version}`
  const [etat, setEtat] = useState({ vue: null, cle: null })

  const [occupe, setOccupe] = useState(false) // une action est en cours : tous les boutons attendent
  const [aConfirmer, setAConfirmer] = useState(null) // id de l'article dont on confirme la suppression
  const [erreurAction, setErreurAction] = useState(null)

  useEffect(() => {
    const controle = new AbortController()
    listerArticlesAdmin({ page, status }, controle.signal)
      .then((resultat) => setEtat({ vue, cle, resultat }))
      .catch((erreur) => {
        if (erreur.name === 'AbortError') return
        if (erreur.statut === 401) return expirerSession()
        setEtat({ vue, cle, erreur })
      })
    return () => controle.abort()
  }, [cle, vue, page, status, expirerSession])

  async function executer(fonction, id) {
    setErreurAction(null)
    setOccupe(true)
    try {
      await fonction(id)
      setAConfirmer(null)
    } catch (erreur) {
      if (erreur.statut === 401) return expirerSession()
      // 404 : l'article a disparu entre-temps (autre onglet) : la liste rechargée le montrera.
      setErreurAction(erreur.statut === 404 ? 'Cet article n’existe plus.' : messageErreur(erreur))
    } finally {
      setOccupe(false)
    }
    setVersion((v) => v + 1)
  }

  const memeVue = etat.vue === vue
  const aJour = etat.cle === cle
  const resultat = memeVue ? etat.resultat : undefined

  // Page au-delà de la fin (dernier article de la dernière page supprimé, ou page tapée à la main).
  if (aJour && resultat && resultat.data.length === 0 && page > 1) {
    return <Navigate to={lien(resultat.meta.totalPages, status)} replace />
  }

  return (
    <>
      <div className="barre-titre">
        <h1>Articles</h1>
        <Link to="/admin/articles/nouveau" className="bouton">
          Nouvel article
        </Link>
      </div>

      <nav className="filtres" aria-label="Filtrer par statut">
        {FILTRES.map((f) => (
          <Link key={f.nom} to={lien(1, f.status)} aria-current={f.status === status ? 'page' : undefined}>
            {f.nom}
          </Link>
        ))}
      </nav>

      {erreurAction && <p role="alert" className="erreur">{erreurAction}</p>}

      {!memeVue && <p>Chargement…</p>}
      {memeVue && etat.erreur && (
        <>
          <p role="alert">Erreur : {messageErreur(etat.erreur)}</p>
          <button type="button" onClick={() => setVersion((v) => v + 1)}>
            Réessayer
          </button>
        </>
      )}
      {resultat && (
        <Liste
          resultat={resultat}
          page={page}
          status={status}
          occupe={occupe}
          rechargement={!aJour}
          aConfirmer={aConfirmer}
          surConfirmer={setAConfirmer}
          surPublier={(id) => executer(publierArticle, id)}
          surDepublier={(id) => executer(depublierArticle, id)}
          surSupprimer={(id) => executer(supprimerArticle, id)}
        />
      )}
    </>
  )
}

function Liste({ resultat, page, status, occupe, rechargement, aConfirmer, surConfirmer, surPublier, surDepublier, surSupprimer }) {
  const { data, meta } = resultat

  if (data.length === 0) {
    return <p>{status ? 'Aucun article avec ce statut.' : 'Aucun article pour l’instant.'}</p>
  }

  return (
    <>
      <table className="table-admin" aria-busy={rechargement}>
        <thead>
          <tr>
            <th scope="col">Titre</th>
            <th scope="col">Statut</th>
            <th scope="col">Modifié le</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((article) => {
            const publie = article.status === 'published'
            return (
              <tr key={article.id}>
                <td>
                  <Link to={`/admin/articles/${article.id}`}>{article.title}</Link>
                  {article.tags.length > 0 && (
                    <div className="meta">{article.tags.map((t) => t.name).join(', ')}</div>
                  )}
                </td>
                <td>
                  <span className={publie ? 'badge publie' : 'badge brouillon'}>
                    {publie ? 'Publié' : 'Brouillon'}
                  </span>
                </td>
                <td>{formaterDateHeure(article.updatedAt)}</td>
                <td>
                  {aConfirmer === article.id ? (
                    <span role="group" aria-label={`Confirmer la suppression de ${article.title}`}>
                      Supprimer définitivement ?{' '}
                      <button type="button" className="danger" disabled={occupe} onClick={() => surSupprimer(article.id)}>
                        Oui, supprimer
                      </button>{' '}
                      <button type="button" disabled={occupe} onClick={() => surConfirmer(null)}>
                        Annuler
                      </button>
                    </span>
                  ) : (
                    <span className="actions">
                      <Link to={`/admin/articles/${article.id}`}>Modifier</Link>
                      {publie && <Link to={`/articles/${article.slug}`}>Voir</Link>}
                      <button
                        type="button"
                        disabled={occupe}
                        onClick={() => (publie ? surDepublier(article.id) : surPublier(article.id))}
                      >
                        {publie ? 'Dépublier' : 'Publier'}
                      </button>
                      <button type="button" disabled={occupe} onClick={() => surConfirmer(article.id)}>
                        Supprimer
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {meta.totalPages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          {page > 1 ? <Link to={lien(page - 1, status)}>← Précédent</Link> : <span />}
          <span>
            Page {meta.page} sur {meta.totalPages}
          </span>
          {page < meta.totalPages ? <Link to={lien(page + 1, status)}>Suivant →</Link> : <span />}
        </nav>
      )}
    </>
  )
}
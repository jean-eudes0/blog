import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { lireArticle } from '../lib/api.js'
import { rendreMarkdown } from '../lib/markdown.js'
import NonTrouve from './NonTrouve.jsx'
import { formaterDate } from '../lib/dates.js'



export default function PageArticle() {
  const { slug } = useParams()
  const [etat, setEtat] = useState({ slug: null })

  useEffect(() => {
    const controle = new AbortController()
    lireArticle(slug, controle.signal)
      .then((article) => setEtat({ slug, article }))
      .catch((erreur) => {
        if (erreur.name === 'AbortError') return
        setEtat({ slug, erreur })
      })
    return () => controle.abort()
  }, [slug])

  // Les états d'un autre article (navigation) ne comptent pas : on est en chargement.
  const chargement = etat.slug !== slug
  const article = chargement ? undefined : etat.article
  const erreur = chargement ? undefined : etat.erreur

  const html = useMemo(() => (article ? rendreMarkdown(article.contentMd) : ''), [article])

  if (chargement) return <p>Chargement…</p>
  // Un slug inconnu et un brouillon renvoient le même 404 : on affiche la même page.
  // Un slug mal formé (trop long : 414, invalide : 400) est aussi, pour le visiteur, une page qui n'existe pas.
  // Seul le 429 (trop de requêtes) est une vraie erreur à afficher.
  if (erreur && erreur.statut >= 400 && erreur.statut < 500 && erreur.statut !== 429) return <NonTrouve />
  if (erreur) return <p role="alert">Erreur : {erreur.message}</p>

  return (
    <article>
      <p>
        <Link to="/">← Tous les articles</Link>
      </p>
      <h1>{article.title}</h1>
      <p className="meta">
        {formaterDate(article.publishedAt)} · {article.readingTime} min de lecture
        {article.tags.length > 0 && ` · ${article.tags.map((t) => t.name).join(', ')}`}
      </p>
      <div className="contenu" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
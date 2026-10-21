import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import FormulaireArticle from '../components/FormulaireArticle.jsx'
import {
  depublierArticle,
  lireArticleAdmin,
  modifierArticle,
  publierArticle,
  supprimerArticle,
} from '../lib/api.js'
import { formaterDateHeure } from '../lib/dates.js'
import { messageErreur } from '../lib/messages-erreur.js'
import { articleVersValeurs, champsModifies, erreursDepuisApi } from '../lib/validation-article.js'
import NonTrouve from './NonTrouve.jsx'

// Un identifiant d'article est un entier PostgreSQL : 1 à 2147483647, sans zéro au début.
function idValide(texte) {
  return /^[1-9][0-9]{0,9}$/.test(texte) && Number(texte) <= 2147483647
}

export default function AdminEdition() {
  const { id } = useParams()
  if (!idValide(id)) return <NonTrouve />
  // key : en passant d'un article à un autre, tout l'état repart de zéro.
  return <Edition key={id} id={id} />
}

function Edition({ id }) {
  const { expirerSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [etat, setEtat] = useState({ chargee: false })
  const [tentative, setTentative] = useState(0)
  const [version, setVersion] = useState(0) // monte à chaque enregistrement : le formulaire repart des valeurs du serveur
  const [message, setMessage] = useState(location.state?.message ?? null)
  const [erreurAction, setErreurAction] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const [confirmeSuppression, setConfirmeSuppression] = useState(false)

  useEffect(() => {
    const controle = new AbortController()
    lireArticleAdmin(id, controle.signal)
      .then((article) => setEtat({ chargee: true, article }))
      .catch((erreur) => {
        if (erreur.name === 'AbortError') return
        if (erreur.statut === 401) return expirerSession()
        setEtat({ chargee: true, erreur })
      })
    return () => controle.abort()
  }, [id, tentative, expirerSession])

  if (!etat.chargee) return <p>Chargement…</p>
  if (etat.erreur?.statut === 404) return <NonTrouve />
  if (etat.erreur) {
    return (
      <>
        <p role="alert">Erreur : {messageErreur(etat.erreur)}</p>
        <button type="button" onClick={() => { setEtat({ chargee: false }); setTentative((t) => t + 1) }}>
          Réessayer
        </button>
      </>
    )
  }

  const { article } = etat
  const publie = article.status === 'published'
  const valeursEnregistrees = articleVersValeurs(article)

  async function enregistrer(valeurs) {
    setMessage(null)
    setErreurAction(null)
    try {
      const modifies = champsModifies(valeurs, valeursEnregistrees)
      const misAJour = await modifierArticle(article.id, modifies)
      setEtat({ chargee: true, article: misAJour })
      setVersion((v) => v + 1)
      setMessage('Modifications enregistrées.')
    } catch (erreur) {
      if (erreur.statut === 401) return void expirerSession()
      if (erreur.statut === 404) return void setEtat({ chargee: true, erreur })
      const champs = erreur.statut === 400 ? erreursDepuisApi(erreur.details) : {}
      return { erreurs: Object.keys(champs).length > 0 ? champs : { general: messageErreur(erreur) } }
    }
  }

  async function changerStatut() {
    setMessage(null)
    setErreurAction(null)
    setOccupe(true)
    try {
      const misAJour = await (publie ? depublierArticle : publierArticle)(article.id)
      setEtat({ chargee: true, article: misAJour })
      setMessage(publie ? 'Article dépublié : il est redevenu un brouillon.' : 'Article publié.')
    } catch (erreur) {
      if (erreur.statut === 401) return void expirerSession()
      if (erreur.statut === 404) return void setEtat({ chargee: true, erreur })
      setErreurAction(messageErreur(erreur))
    } finally {
      setOccupe(false)
    }
  }

  async function supprimer() {
    setMessage(null)
    setErreurAction(null)
    setOccupe(true)
    try {
      await supprimerArticle(article.id)
      navigate('/admin', { replace: true })
    } catch (erreur) {
      if (erreur.statut === 401) return void expirerSession()
      if (erreur.statut === 404) return void navigate('/admin', { replace: true })
      setErreurAction(messageErreur(erreur))
      setOccupe(false)
    }
  }

  return (
    <>
      <p>
        <Link to="/admin">← Tous les articles</Link>
      </p>
      <h1>Modifier l’article</h1>

      <p className="meta">
        <span className={publie ? 'badge publie' : 'badge brouillon'}>{publie ? 'Publié' : 'Brouillon'}</span>{' '}
        Adresse : <code>/articles/{article.slug}</code> (elle ne change plus) · modifié le{' '}
        {formaterDateHeure(article.updatedAt)}
        {publie && (
          <>
            {' · '}
            <Link to={`/articles/${article.slug}`}>Voir sur le blog</Link>
          </>
        )}
      </p>

      {message && <p role="status" className="succes">{message}</p>}
      {erreurAction && <p role="alert" className="erreur">{erreurAction}</p>}

      <div className="actions barre-actions">
        <button type="button" disabled={occupe} onClick={changerStatut}>
          {publie ? 'Dépublier' : 'Publier'}
        </button>
        {confirmeSuppression ? (
          <span role="group" aria-label="Confirmer la suppression">
            Supprimer définitivement ?{' '}
            <button type="button" className="danger" disabled={occupe} onClick={supprimer}>
              Oui, supprimer
            </button>{' '}
            <button type="button" disabled={occupe} onClick={() => setConfirmeSuppression(false)}>
              Annuler
            </button>
          </span>
        ) : (
          <button type="button" disabled={occupe} onClick={() => setConfirmeSuppression(true)}>
            Supprimer
          </button>
        )}
      </div>
      <p className="meta">Publier et dépublier agissent sur la version enregistrée : enregistre d’abord tes modifications.</p>

      <FormulaireArticle
        key={`${article.id}-${version}`}
        valeursInitiales={valeursEnregistrees}
        reference={valeursEnregistrees}
        libelleEnvoi="Enregistrer"
        surEnvoyer={enregistrer}
      />
    </>
  )
}

import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import FormulaireArticle from '../components/FormulaireArticle.jsx'
import { creerArticle } from '../lib/api.js'
import { messageErreur } from '../lib/messages-erreur.js'
import { VALEURS_VIDES, erreursDepuisApi, valeursVersCorps } from '../lib/validation-article.js'

export default function AdminNouveau() {
  const { expirerSession } = useAuth()
  const navigate = useNavigate()

  async function envoyer(valeurs) {
    try {
      const article = await creerArticle(valeursVersCorps(valeurs))
      // L'article est créé en brouillon : on ouvre sa page d'édition (là se trouve le bouton Publier).
      navigate(`/admin/articles/${article.id}`, { replace: true, state: { message: 'Brouillon créé.' } })
    } catch (erreur) {
      if (erreur.statut === 401) return void expirerSession()
      const champs = erreur.statut === 400 ? erreursDepuisApi(erreur.details) : {}
      if (Object.keys(champs).length > 0) return { erreurs: champs }
      return { erreurs: { general: messageErreur(erreur) } }
    }
  }

  return (
    <>
      <p>
        <Link to="/admin">← Tous les articles</Link>
      </p>
      <h1>Nouvel article</h1>
      <p className="meta">L’article est enregistré en brouillon : tu le publieras ensuite.</p>
      <FormulaireArticle
        valeursInitiales={VALEURS_VIDES}
        reference={VALEURS_VIDES}
        libelleEnvoi="Enregistrer le brouillon"
        surEnvoyer={envoyer}
      />
    </>
  )
}
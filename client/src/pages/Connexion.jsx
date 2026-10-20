import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth.js'

// Un chemin interne seulement ("/admin"), jamais une adresse complète ni "//site.com" :
// sans ce contrôle, une redirection après connexion pourrait renvoyer vers un site étranger.
function destinationSure(depuis) {
  return typeof depuis === 'string' && depuis.startsWith('/') && !depuis.startsWith('//') ? depuis : '/admin'
}

function messagePour(erreur) {
  switch (erreur.statut) {
    case 401:
      return 'E-mail ou mot de passe incorrect.'
    case 429:
      return 'Trop de tentatives. Réessaie dans une minute.'
    case 400:
      return 'Vérifie l’adresse e-mail et le mot de passe saisis.'
    case 0:
      return 'Impossible de joindre le serveur.'
    default:
      return erreur.message
  }
}

export default function Connexion() {
  const { statut, connecter } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  // Déjà connecté (ou connexion réussie) : on part vers la page demandée au départ.
  if (statut === 'connecte') return <Navigate to={destinationSure(location.state?.depuis)} replace />

  async function envoyer(evenement) {
    evenement.preventDefault()
    if (envoiEnCours) return
    setErreur(null)
    setEnvoiEnCours(true)
    try {
      await connecter(email.trim(), motDePasse)
    } catch (e) {
      setErreur(messagePour(e))
      setMotDePasse('')
      setEnvoiEnCours(false)
    }
  }

  return (
    <>
      <h1>Connexion</h1>
      {statut === 'erreur' && (
        <p role="alert">Le serveur ne répond pas pour l’instant : la connexion peut échouer.</p>
      )}
      <form onSubmit={envoyer} className="formulaire">
        <label>
          Adresse e-mail
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </label>
        {erreur && <p role="alert" className="erreur">{erreur}</p>}
        <button type="submit" disabled={envoiEnCours}>
          {envoiEnCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </>
  )
}
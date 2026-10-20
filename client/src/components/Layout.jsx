import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import ErrorBoundary from './ErrorBoundary.jsx'

export default function Layout() {
  const { statut, deconnecter } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [erreurDeconnexion, setErreurDeconnexion] = useState(null)

  async function quitter() {
    setErreurDeconnexion(null)
    // D'abord quitter la page, ensuite fermer la session. Dans l'autre sens, dès que l'utilisateur
    // devient anonyme, la route privée le renverrait vers /connexion avant que navigate('/') ne passe.
    navigate('/', { replace: true })
    try {
      await deconnecter()
    } catch (erreur) {
      setErreurDeconnexion(erreur.message)
    }
  }

  return (
    <>
      <header className="entete">
        <Link to="/">Blog</Link>
        <nav aria-label="Compte">
          {statut === 'connecte' && (
            <>
              <Link to="/admin">Admin</Link>
              <button type="button" className="lien" onClick={quitter}>
                Se déconnecter
              </button>
            </>
          )}
          {statut === 'anonyme' && <Link to="/connexion">Connexion</Link>}
        </nav>
      </header>
      {erreurDeconnexion && (
        <p role="alert" className="entete">
          Déconnexion impossible : {erreurDeconnexion}
        </p>
      )}
      <main>
        {/* key : à chaque changement de page, la boundary repart de zéro (l'erreur d'une page ne bloque pas les autres). */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </>
  )
}
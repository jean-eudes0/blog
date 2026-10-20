import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth.js'

// Enveloppe les pages réservées à l'admin. Attention : ceci ne protège que l'AFFICHAGE.
// La vraie protection est côté API (401 sans session sur /api/admin/*) : n'importe qui peut
// modifier le JavaScript de son navigateur, personne ne peut modifier la réponse du serveur.
export default function RoutePrivee() {
  const { statut, reessayer } = useAuth()
  const location = useLocation()

  if (statut === 'chargement') return <p>Chargement…</p>

  if (statut === 'erreur') {
    return (
      <>
        <p role="alert">Impossible de vérifier ta connexion : le serveur ne répond pas.</p>
        <button type="button" onClick={reessayer}>
          Réessayer
        </button>
      </>
    )
  }

  if (statut === 'anonyme') {
    // `depuis` : la page demandée, pour y revenir après la connexion.
    return <Navigate to="/connexion" replace state={{ depuis: location.pathname + location.search }} />
  }

  return <Outlet />
}
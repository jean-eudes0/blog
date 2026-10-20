import { useAuth } from '../auth/useAuth.js'

// Page d'accueil de l'espace admin. La liste et le formulaire d'articles arrivent à l'étape 8.
export default function Admin() {
  const { user } = useAuth()
  return (
    <>
      <h1>Espace admin</h1>
      <p>Connecté en tant que {user.email}.</p>
      <p>La gestion des articles arrive à l’étape 8.</p>
    </>
  )
}
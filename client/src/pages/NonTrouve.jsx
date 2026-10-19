import { Link } from 'react-router'

export default function NonTrouve() {
  return (
    <>
      <h1>Page introuvable</h1>
      <p>Cette adresse ne correspond à aucune page.</p>
      <p>
        <Link to="/">Retour à l’accueil</Link>
      </p>
    </>
  )
}
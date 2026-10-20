import { Component } from 'react'
import { Link } from 'react-router'

// Capture les erreurs de RENDU de ses enfants (un champ null lu comme un objet, par exemple)
// pour afficher un message à la place d'une page blanche. Elle ne capte PAS les erreurs dans
// les gestionnaires d'événements ni dans le code asynchrone (fetch) : celles-ci restent gérées
// par les try/catch et les états d'erreur des pages. Seule une classe peut être une
// ErrorBoundary : React n'a pas d'équivalent en fonction.
export default class ErrorBoundary extends Component {
  state = { erreur: null }

  static getDerivedStateFromError(erreur) {
    return { erreur }
  }

  componentDidCatch(erreur, infos) {
    // Le détail reste dans la console du développeur, jamais affiché au visiteur.
    console.error('Erreur de rendu :', erreur, infos.componentStack)
  }

  render() {
    if (!this.state.erreur) return this.props.children
    return (
      <div role="alert">
        <h1>Une erreur est survenue</h1>
        <p>Cette partie de la page n’a pas pu s’afficher.</p>
        <p>
          <button type="button" onClick={() => this.setState({ erreur: null })}>
            Réessayer
          </button>{' '}
          <Link to="/" onClick={() => this.setState({ erreur: null })}>
            Retour à l’accueil
          </Link>
        </p>
      </div>
    )
  }
}
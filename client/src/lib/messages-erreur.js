// Message à afficher pour une ErreurApi (lib/api.js) qui n'a pas de traitement particulier.
export function messageErreur(erreur) {
  switch (erreur.statut) {
    case 0:
      return 'Impossible de joindre le serveur.'
    case 429:
      return 'Trop de requêtes. Réessaie dans une minute.'
    default:
      return erreur.message
  }
}
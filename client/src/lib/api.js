// Couche d'appel à l'API (docs/api.md). Toutes les erreurs deviennent des ErreurApi,
// que la réponse soit au format du §5, vide, ou que le serveur soit injoignable.
export class ErreurApi extends Error {
  constructor(statut, code, message, details) {
    super(message)
    this.name = 'ErreurApi'
    this.statut = statut
    this.code = code
    this.details = details
  }
}

export async function appelApi(chemin, { methode = 'GET', corps, signal } = {}) {
  const options = { method: methode, headers: {}, signal, credentials: 'same-origin' }
  // L'API n'accepte que le JSON : tout corps part en JSON, avec l'en-tête qui va avec.
  if (corps !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(corps)
  }

  let reponse
  try {
    reponse = await fetch(`/api${chemin}`, options)
  } catch (erreur) {
    if (erreur.name === 'AbortError') throw erreur
    throw new ErreurApi(0, 'RESEAU', 'Impossible de joindre le serveur')
  }

  if (reponse.status === 204) return null

  let donnees = null
  try {
    donnees = await reponse.json()
  } catch {
    // Corps vide ou pas du JSON (ex. proxy dont la cible est arrêtée) : traité plus bas.
  }

  if (!reponse.ok) {
    const erreur = donnees?.error
    throw new ErreurApi(
      reponse.status,
      erreur?.code ?? 'ERREUR',
      erreur?.message ?? 'Erreur inattendue',
      erreur?.details,
    )
  }
  return donnees
}

export function listerArticles({ page = 1, limit = 10 } = {}, signal) {
  const requete = new URLSearchParams({ page, limit })
  return appelApi(`/articles?${requete}`, { signal })
}

export function lireArticle(slug, signal) {
  return appelApi(`/articles/${encodeURIComponent(slug)}`, { signal })
}

// --- Authentification (docs/api.md §2) ---

// 200 { user } si une session est ouverte, sinon ErreurApi avec statut 401.
export function utilisateurCourant(signal) {
  return appelApi('/auth/me', { signal })
}

export function seConnecter(email, password) {
  return appelApi('/auth/login', { methode: 'POST', corps: { email, password } })
}

// Sans corps : l'API répond 204 même sans session (route idempotente).
export function seDeconnecter() {
  return appelApi('/auth/logout', { methode: 'POST' })
}

// --- Administration des articles (docs/api.md §4) : toutes ces routes exigent une session ---

export function listerArticlesAdmin({ page = 1, limit = 10, status } = {}, signal) {
  const requete = new URLSearchParams({ page, limit })
  if (status) requete.set('status', status)
  return appelApi(`/admin/articles?${requete}`, { signal })
}

export function lireArticleAdmin(id, signal) {
  return appelApi(`/admin/articles/${encodeURIComponent(id)}`, { signal })
}

export function creerArticle(donnees) {
  return appelApi('/admin/articles', { methode: 'POST', corps: donnees })
}

export function modifierArticle(id, donnees) {
  return appelApi(`/admin/articles/${encodeURIComponent(id)}`, { methode: 'PATCH', corps: donnees })
}

export function publierArticle(id) {
  return appelApi(`/admin/articles/${encodeURIComponent(id)}/publish`, { methode: 'POST' })
}

export function depublierArticle(id) {
  return appelApi(`/admin/articles/${encodeURIComponent(id)}/unpublish`, { methode: 'POST' })
}

export function supprimerArticle(id) {
  return appelApi(`/admin/articles/${encodeURIComponent(id)}`, { methode: 'DELETE' })
}
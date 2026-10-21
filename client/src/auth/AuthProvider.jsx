import { useCallback, useEffect, useMemo, useState } from 'react'
import { seConnecter, seDeconnecter, utilisateurCourant } from '../lib/api.js'
import { ContexteAuth } from './contexte.js'

// Qui est connecté ? Le cookie de session est HttpOnly : le JavaScript ne peut pas le lire,
// on demande donc à l'API (GET /api/auth/me) au chargement de la page.
//
// statut :
//   'chargement' : on ne sait pas encore
//   'connecte'   : session valide, `user` = { id, email, role }
//   'anonyme'    : l'API a répondu 401, personne n'est connecté
//   'erreur'     : l'API n'a pas répondu (réseau, serveur arrêté). On NE sait PAS si une session
//                  existe : on ne renvoie donc pas vers la page de connexion, on propose de réessayer.
export default function AuthProvider({ children }) {
  const [etat, setEtat] = useState({ statut: 'chargement', user: null })

  const verifier = useCallback((signal) => {
    return utilisateurCourant(signal)
      .then(({ user }) => setEtat({ statut: 'connecte', user }))
      .catch((erreur) => {
        if (erreur.name === 'AbortError') return
        setEtat({ statut: erreur.statut === 401 ? 'anonyme' : 'erreur', user: null })
      })
  }, [])

  useEffect(() => {
    const controle = new AbortController()
    verifier(controle.signal)
    return () => controle.abort()
  }, [verifier])

  const reessayer = useCallback(() => {
    setEtat({ statut: 'chargement', user: null })
    verifier()
  }, [verifier])

  // Les erreurs (mauvais mot de passe, trop de tentatives...) remontent à l'appelant, qui les affiche.
  const connecter = useCallback(async (email, motDePasse) => {
    const { user } = await seConnecter(email, motDePasse)
    setEtat({ statut: 'connecte', user })
  }, [])

  const deconnecter = useCallback(async () => {
    await seDeconnecter()
    setEtat({ statut: 'anonyme', user: null })
  }, [])

  // L'API a répondu 401 pendant que l'on se croyait connecté (session expirée ou supprimée) :
  // on passe en anonyme, la route privée renvoie alors vers /connexion.
  const expirerSession = useCallback(() => setEtat({ statut: 'anonyme', user: null }), [])

  const valeur = useMemo(
    () => ({ ...etat, connecter, deconnecter, reessayer, expirerSession }),
    [etat, connecter, deconnecter, reessayer, expirerSession],
  )

  return <ContexteAuth value={valeur}>{children}</ContexteAuth>
}
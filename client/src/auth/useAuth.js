import { useContext } from 'react'
import { ContexteAuth } from './contexte.js'

export function useAuth() {
  const contexte = useContext(ContexteAuth)
  if (!contexte) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>')
  return contexte
}
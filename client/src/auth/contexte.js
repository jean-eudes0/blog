import { createContext } from 'react'

// Le contexte vit dans son propre fichier : un fichier de composant ne doit exporter que des
// composants (règle react-refresh), sinon le rechargement à chaud de Vite ne fonctionne plus.
export const ContexteAuth = createContext(null)
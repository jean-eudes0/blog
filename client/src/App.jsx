import { Route, Routes } from 'react-router'
import Layout from './components/Layout.jsx'
import RoutePrivee from './components/RoutePrivee.jsx'
import Accueil from './pages/Accueil.jsx'
import AdminEdition from './pages/AdminEdition.jsx'
import AdminListe from './pages/AdminListe.jsx'
import AdminNouveau from './pages/AdminNouveau.jsx'
import Connexion from './pages/Connexion.jsx'
import NonTrouve from './pages/NonTrouve.jsx'
import PageArticle from './pages/PageArticle.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="articles/:slug" element={<PageArticle />} />
        <Route path="connexion" element={<Connexion />} />
        <Route element={<RoutePrivee />}>
          <Route path="admin" element={<AdminListe />} />
          <Route path="admin/articles/nouveau" element={<AdminNouveau />} />
          <Route path="admin/articles/:id" element={<AdminEdition />} />
        </Route>
        <Route path="*" element={<NonTrouve />} />
      </Route>
    </Routes>
  )
}
import { Route, Routes } from 'react-router'
import Layout from './components/Layout.jsx'
import Accueil from './pages/Accueil.jsx'
import NonTrouve from './pages/NonTrouve.jsx'
import PageArticle from './pages/PageArticle.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="articles/:slug" element={<PageArticle />} />
        <Route path="*" element={<NonTrouve />} />
      </Route>
    </Routes>
  )
}
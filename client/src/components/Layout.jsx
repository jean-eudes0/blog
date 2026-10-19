import { Link, Outlet } from 'react-router'

export default function Layout() {
  return (
    <>
      <header className="entete">
        <Link to="/">Blog</Link>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import InicioPage from './pages/InicioPage.jsx'
import ProfesoresPage from './pages/ProfesoresPage.jsx'
import GruposPage from './pages/GruposPage.jsx'
import MateriasPage from './pages/MateriasPage.jsx'
import ActividadesPage from './pages/ActividadesPage.jsx'
import MallaPage from './pages/MallaPage.jsx'
import GrillaPage from './pages/GrillaPage.jsx'
import HorarioPage from './pages/HorarioPage.jsx'

const navItems = [
  { to: '/', label: 'Inicio', icon: IconHome },
  { to: '/grilla', label: 'Grilla del día', icon: IconClock },
  { to: '/materias', label: 'Materias', icon: IconBook },
  { to: '/actividades', label: 'Actividades', icon: IconClipboard },
  { to: '/grupos', label: 'Grupos', icon: IconUsers },
  { to: '/malla', label: 'Malla curricular', icon: IconLayers },
  { to: '/profesores', label: 'Profesores', icon: IconPerson },
  { to: '/horario', label: 'Horario', icon: IconGrid },
]

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen flex bg-paper">
        <aside className="w-64 shrink-0 bg-ink-950 text-ink-100 flex flex-col">
          <div className="px-6 py-6 border-b border-ink-800">
            <p className="font-mono text-[11px] tracking-widest text-sage-400 uppercase mb-1">Liceo · 2026</p>
            <h1 className="font-display text-xl text-white leading-snug">Horarios</h1>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-sage-700 text-white'
                      : 'text-ink-300 hover:bg-ink-900 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="px-6 py-4 border-t border-ink-800 text-xs text-ink-400">
            Datos guardados en Firebase
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <Routes>
            <Route path="/" element={<InicioPage />} />
            <Route path="/grilla" element={<GrillaPage />} />
            <Route path="/materias" element={<MateriasPage />} />
            <Route path="/actividades" element={<ActividadesPage />} />
            <Route path="/malla" element={<MallaPage />} />
            <Route path="/grupos" element={<GruposPage />} />
            <Route path="/profesores" element={<ProfesoresPage />} />
            <Route path="/horario" element={<HorarioPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

function IconHome(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconBook(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
    </svg>
  )
}
function IconClipboard(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="5.5" y="4.5" width="13" height="16" rx="1.5" />
      <path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" strokeLinecap="round" />
      <path d="M8.5 10.5h7M8.5 14h7M8.5 17.5h4.5" strokeLinecap="round" />
    </svg>
  )
}
function IconLayers(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3.5 4 8l8 4.5L20 8l-8-4.5Z" strokeLinejoin="round" />
      <path d="M4 12l8 4.5 8-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16l8 4.5 8-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconUsers(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15.8 14.2c2.3.3 4.2 2.1 4.2 4.8" strokeLinecap="round" />
    </svg>
  )
}
function IconPerson(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" strokeLinecap="round" />
    </svg>
  )
}
function IconGrid(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  )
}

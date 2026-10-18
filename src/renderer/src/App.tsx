import { Fragment, useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import type { SessionUser } from '@shared/types'
import { api, call } from './api'
import { useI18n, type Lang } from './i18n'
import Balance1 from './pages/Balance1'
import Balance2 from './pages/Balance2'
import Login from './pages/Login'
import Operations from './pages/Operations'
import Settings from './pages/Settings'

/**
 * Le menu latéral ne porte que les types de pesée (on ne mélange pas les entrées
 * et les sorties) ; les deux balances et les tickets du type choisi sont des
 * onglets en haut de la page.
 *
 * Chaque type a sa couleur (CSS : `data-type`), reprise dans le menu, le bandeau
 * et les boutons : l'opérateur voit à tout moment s'il est sur une entrée ou une
 * sortie, et un changement de menu se remarque par l'animation du bandeau.
 */
const MENUS = [
  { type: 'ENTREE', path: '/entrees', icon: '↓' },
  { type: 'SORTIE', path: '/sorties', icon: '↑' },
  { type: 'TRANSFERT', path: '/transferts', icon: '⇄' },
  { type: 'TIERS', path: '/tiers', icon: '⚖' }
] as const

export default function App() {
  const { t } = useI18n()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.auth
      .current()
      .then((current) => setUser(current))
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [])

  if (!ready) return <p className="center-page muted">{t('common.loading')}</p>
  if (!user) return <Login onLogin={setUser} />

  return (
    <HashRouter>
      <Shell user={user} onLogout={() => setUser(null)} />
    </HashRouter>
  )
}

/** Le menu est dans le Router : il doit savoir quelle page est ouverte. */
function Shell({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { t, lang, setLang } = useI18n()
  const location = useLocation()
  const currentMenu = MENUS.find((menu) => location.pathname.startsWith(menu.path)) ?? null
  const currentType = currentMenu?.type ?? null

  // Compte les changements de type, pour rejouer l'animation du bandeau.
  const [flip, setFlip] = useState(0)
  useEffect(() => {
    setFlip((n) => n + 1)
  }, [currentType])

  return (
    <div className="shell" data-type={currentMenu?.type}>
      <aside className="sidebar">
        <span className="brand">{t('app.title')}</span>
        <nav>
          {MENUS.map((menu) => (
            <div className="menu" key={menu.type}>
              {/* Actif sur les trois onglets du type, pas seulement sur la 1re balance. */}
              <NavLink
                to={`${menu.path}/balance-1`}
                data-type={menu.type}
                className={currentMenu?.type === menu.type ? 'active' : undefined}
              >
                <span className="type-icon" aria-hidden>
                  {menu.icon}
                </span>
                {t(`station.type.${menu.type}`)}
              </NavLink>
            </div>
          ))}
          <div className="menu">
            <NavLink to="/settings">{t('nav.settings')}</NavLink>
          </div>
        </nav>
        <div className="sidebar-foot">
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
          <span className="muted">{user.fullName}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void call(api.auth.logout()).finally(onLogout)
            }}
          >
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      <main>
        {currentMenu && (
          // La classe `flip-N` alterne à chaque changement de type : le CSS rejoue alors l'animation.
          <header className={`type-bar flip-${flip % 2}`}>
            <span className="type-icon" aria-hidden>
              {currentMenu.icon}
            </span>
            <div className="type-title">
              <h1>{t(`station.type.${currentMenu.type}`)}</h1>
              <p>{t(`station.hint.${currentMenu.type}`)}</p>
            </div>
            <nav className="tabs">
              <NavLink to={`${currentMenu.path}/balance-1`}>{t('nav.balance1')}</NavLink>
              <NavLink to={`${currentMenu.path}/balance-2`}>{t('nav.balance2')}</NavLink>
              <NavLink to={`${currentMenu.path}/tickets`}>{t('nav.tickets')}</NavLink>
            </nav>
          </header>
        )}
        <div className="page" key={currentMenu?.type ?? 'settings'}>
          <Routes>
            {MENUS.map((menu) => (
              <Fragment key={menu.type}>
                <Route path={`${menu.path}/balance-1`} element={<Balance1 type={menu.type} />} />
                <Route path={`${menu.path}/balance-2`} element={<Balance2 type={menu.type} />} />
                <Route path={`${menu.path}/tickets`} element={<Operations type={menu.type} />} />
              </Fragment>
            ))}
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/entrees/balance-1" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AccountMenu } from './AccountMenu'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/history', label: 'History' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/setup/units', label: 'Setup' },
]

export function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Close mobile menu on navigation
  const handleNavClick = () => setMenuOpen(false)

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="px-4 sm:px-6 py-3 flex items-center gap-4 sm:gap-6">
        <span className="text-sm font-semibold text-gray-400 tracking-wide mr-2">Store Attention</span>

        {/* Desktop nav links */}
        <div className="hidden sm:flex items-center gap-6">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-gray-400 hover:text-white'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <AccountMenu />
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            className="sm:hidden text-gray-400 hover:text-white p-1"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-gray-800 px-4 py-2 space-y-1">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={handleNavClick}
              className={`block px-3 py-2 rounded text-sm font-medium transition-colors ${
                location.pathname.startsWith(to) ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  )
}

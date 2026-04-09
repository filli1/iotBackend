import { NavLink } from 'react-router-dom'
import { AccountMenu } from './AccountMenu'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/history', label: 'History' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/setup/units', label: 'Setup' },
]

export function NavBar() {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
      <span className="text-sm font-semibold text-gray-400 tracking-wide mr-2">Store Attention</span>
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
      <div className="ml-auto">
        <AccountMenu />
      </div>
    </nav>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/authStore'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { SetupUnitsPage } from './pages/SetupUnitsPage'
import { ConfigurePage } from './pages/ConfigurePage'
import { CalibrationPage } from './pages/CalibrationPage'
import { HistoryPage } from './pages/HistoryPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { UsersPage } from './pages/UsersPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/setup/units" element={<RequireAuth><SetupUnitsPage /></RequireAuth>} />
        <Route path="/setup/units/:unitId/configure" element={<RequireAuth><ConfigurePage /></RequireAuth>} />
        <Route path="/calibrate/:unitId" element={<RequireAuth><CalibrationPage /></RequireAuth>} />
        <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        <Route path="/analytics" element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
        <Route path="/settings/users" element={<RequireAuth><UsersPage /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  )
}

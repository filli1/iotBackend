import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { SetupUnitsPage } from './pages/SetupUnitsPage'
import { ConfigurePage } from './pages/ConfigurePage'
import { CalibrationPage } from './pages/CalibrationPage'
import { HistoryPage } from './pages/HistoryPage'
import { AnalyticsPage } from './pages/AnalyticsPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/setup/units" element={<SetupUnitsPage />} />
        <Route path="/setup/units/:unitId/configure" element={<ConfigurePage />} />
        <Route path="/calibrate/:unitId" element={<CalibrationPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

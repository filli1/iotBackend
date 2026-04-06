import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SetupUnitsPage } from './pages/SetupUnitsPage'
import { ConfigurePage } from './pages/ConfigurePage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/setup/units" replace />} />
        <Route path="/setup/units" element={<SetupUnitsPage />} />
        <Route path="/setup/units/:unitId/configure" element={<ConfigurePage />} />
      </Routes>
    </BrowserRouter>
  )
}

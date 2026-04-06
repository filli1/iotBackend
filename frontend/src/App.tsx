import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SetupUnitsPage } from './pages/SetupUnitsPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/setup/units" replace />} />
        <Route path="/setup/units" element={<SetupUnitsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

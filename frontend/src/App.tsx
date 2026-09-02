import React, { createContext, useContext, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'
import RiskPage from './pages/RiskPage'
import AnalyticsPage from './pages/AnalyticsPage'
import FacilitiesPage from './pages/FacilitiesPage'
import HistoryPage from './pages/HistoryPage'
import TerminalPage from './pages/TerminalPage'
import type { ApiThermalEvent } from './types/api'
import { useLiveData } from './hooks/useLiveData'
import type { LiveData } from './hooks/useLiveData'

// ── App-level context ─────────────────────────────────────

interface AppContextValue extends LiveData {
  selectedEvent: ApiThermalEvent | null
  setSelectedEvent: (e: ApiThermalEvent | null) => void
}

export const AppContext = createContext<AppContextValue>({
  selectedEvent: null,
  setSelectedEvent: () => {},
  events: [],
  statistics: null,
  pipelineStatus: null,
  status: 'loading',
  error: null,
  lastUpdatedAt: null,
  refresh: () => {},
})

export function useAppContext() {
  return useContext(AppContext)
}

// ── Layout ────────────────────────────────────────────────

function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <div className="page-content">
          <Routes>
            <Route path="/"           element={<HomePage />} />
            <Route path="/map"        element={<MapPage />} />
            <Route path="/risk"       element={<RiskPage />} />
            <Route path="/analytics"  element={<AnalyticsPage />} />
            <Route path="/facilities" element={<FacilitiesPage />} />
            <Route path="/history"    element={<HistoryPage />} />
            <Route path="/terminal"   element={<TerminalPage />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [selectedEvent, setSelectedEvent] = useState<ApiThermalEvent | null>(null)
  const liveData = useLiveData()

  return (
    <AppContext.Provider value={{ ...liveData, selectedEvent, setSelectedEvent }}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AppContext.Provider>
  )
}

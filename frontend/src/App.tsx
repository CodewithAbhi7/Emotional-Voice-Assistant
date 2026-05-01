import { useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

import { Sidebar } from './components/layout/Sidebar'
import { useWebSocket } from './hooks/useWebSocket'
import { API_BASE_URL } from './lib/constants'
import { AlarmPage } from './pages/AlarmPage'
import { MainPage } from './pages/MainPage'
import { PhrasesPage } from './pages/PhrasesPage'
import { SetupPage } from './pages/SetupPage'
import { useAppStore } from './store/useAppStore'

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

function AppRoutes() {
  useWebSocket()
  const location = useLocation()
  const profiles = useAppStore((state) => state.profiles)
  const setProfiles = useAppStore((state) => state.setProfiles)
  const setSetupComplete = useAppStore((state) => state.setSetupComplete)

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/profiles/`)
        const data = await response.json()
        const loadedProfiles = data.profiles ?? []
        setProfiles(loadedProfiles)
        if (loadedProfiles.length > 0) {
          setSetupComplete(true)
        }
      } catch (error) {
        console.error('Failed to load profiles', error)
      }
    }

    void loadProfiles()
  }, [setProfiles, setSetupComplete])

  const needsSetup = profiles.length === 0
  const isSetupRoute = location.pathname === '/setup'

  if (needsSetup) {
    return <SetupPage />
  }

  return (
    <div className="flex h-screen bg-eva-bg">
      {!isSetupRoute ? <Sidebar /> : null}
      <div className={isSetupRoute ? 'min-w-0 flex-1 overflow-y-auto' : 'min-w-0 flex-1 overflow-hidden'}>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/alarms" element={<AlarmPage />} />
          <Route path="/phrases" element={<PhrasesPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

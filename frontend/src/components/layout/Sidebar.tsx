import { AlarmClock, BookOpen, MessageCircle, Settings, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAppStore } from '../../store/useAppStore'

const NAV_ITEMS = [
  { to: '/', label: 'Chat', icon: MessageCircle },
  { to: '/alarms', label: 'Alarms', icon: AlarmClock },
  { to: '/phrases', label: 'Phrases', icon: BookOpen },
  { to: '/setup', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const wsConnected = useAppStore((state) => state.wsConnected)
  const mode = useAppStore((state) => state.mode)

  return (
    <aside className="flex w-16 flex-col items-center gap-2 border-r border-eva-border bg-eva-surface py-4">
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${
          mode === 'PERSONAL' ? 'bg-violet-700' : 'bg-blue-700'
        }`}
      >
        <Sparkles className="h-5 w-5 text-white" />
      </div>

      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            `flex h-10 w-10 items-center justify-center rounded-xl transition ${
              isActive
                ? 'bg-eva-border text-white'
                : 'text-slate-500 hover:bg-eva-border hover:text-white'
            }`
          }
        >
          <Icon className="h-5 w-5" />
        </NavLink>
      ))}

      <div className="mt-auto rounded-full p-2">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            wsConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
          title={wsConnected ? 'Connected' : 'Disconnected'}
        />
      </div>
    </aside>
  )
}

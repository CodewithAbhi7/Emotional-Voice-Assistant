import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import { useAppStore } from '../../store/useAppStore'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Conversation', subtitle: 'Real-time emotional voice assistant' },
  '/alarms': { title: 'Alarms', subtitle: 'Intent-aware reminders with escalating cloned voice prompts' },
  '/phrases': { title: 'Custom Phrases', subtitle: 'Preview saved phrases in the cloned voice instantly' },
  '/setup': { title: 'Settings', subtitle: 'Manage, test, and delete voice personas' },
}

export function TopBar() {
  const location = useLocation()
  const meta = TITLES[location.pathname] ?? TITLES['/']
  const statusMessage = useAppStore((state) => state.statusMessage)
  const profiles = useAppStore((state) => state.profiles)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const mode = useAppStore((state) => state.mode)
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId)
  const isProfessional = mode === 'PROFESSIONAL'

  const qualityLabel = useMemo(() => {
    if (isProfessional) {
      return 'Work voice - default'
    }

    const active = profiles.find((profile) => profile.id === activeProfileId)
    if (!active) {
      return null
    }

    return `${active.display_name} - ${Math.round((active.quality ?? 0) * 100)}%`
  }, [activeProfileId, isProfessional, profiles])

  return (
    <header className="flex items-center justify-between border-b border-eva-border px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold text-white">{meta.title}</h1>
        <p className="text-sm text-slate-400">{meta.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-full border border-eva-border bg-black/20 px-3 py-1.5 text-xs text-slate-300">
          {statusMessage}
        </div>
        <select
          value={activeProfileId ?? ''}
          onChange={(event) => setActiveProfileId(event.target.value || null)}
          className="rounded-xl border border-eva-border bg-eva-surface px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
        >
          {profiles.length === 0 ? (
            <option value="">No profile</option>
          ) : null}
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.display_name}
            </option>
          ))}
        </select>
        {qualityLabel ? (
          <div className="rounded-full border border-eva-border bg-black/20 px-3 py-1.5 text-xs text-slate-400">
            {qualityLabel}
          </div>
        ) : null}
      </div>
    </header>
  )
}

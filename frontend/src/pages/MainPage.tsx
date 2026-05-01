import { useState } from 'react'
import type { FormEvent } from 'react'

import { AlarmOverlay } from '../components/alarm/AlarmOverlay'
import { ConversationFeed } from '../components/conversation/ConversationFeed'
import { TopBar } from '../components/layout/TopBar'
import { EmotionBadge } from '../components/voice/EmotionBadge'
import { VoiceOrb } from '../components/voice/VoiceOrb'
import { WaveformDisplay } from '../components/voice/WaveformDisplay'
import { CrisisAlert } from '../components/ui/CrisisAlert'
import { ModeToggle } from '../components/ui/ModeToggle'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAppStore } from '../store/useAppStore'

export function MainPage() {
  const profiles = useAppStore((state) => state.profiles)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const mode = useAppStore((state) => state.mode)
  const profile = profiles.find((item) => item.id === activeProfileId) ?? null
  const isProfessional = mode === 'PROFESSIONAL'

  return (
    <div className="flex h-screen flex-col bg-eva-bg text-eva-text">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col">
          <ConversationFeed />
        </section>

        <aside className="flex w-80 flex-shrink-0 flex-col items-center justify-center gap-6 border-l border-eva-border px-6 py-8">
          {isProfessional ? (
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Voice output</p>
              <p className="mt-2 text-xl font-semibold text-white">Work Assistant</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                Default voice
              </p>
            </div>
          ) : profile ? (
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Speaking as</p>
              <p className="mt-2 text-xl font-semibold text-white">{profile.display_name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                {profile.relationship}
              </p>
            </div>
          ) : null}

          <WaveformDisplay />
          <VoiceOrb profileId={activeProfileId} />
          <EmotionBadge />
          <ModeToggle />
          <TextInputFallback />
        </aside>
      </div>

      <CrisisAlert />
      <AlarmOverlay />
    </div>
  )
}

function TextInputFallback() {
  const [text, setText] = useState('')
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const { send } = useWebSocket()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!text.trim()) {
      return
    }
    send({ type: 'TEXT_INPUT', text: text.trim(), profile_id: activeProfileId })
    setText('')
  }

  return (
    <form onSubmit={submit} className="w-full space-y-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Or type here..."
        className="h-24 w-full resize-none rounded-2xl border border-eva-border bg-eva-surface px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
      />
      <button
        type="submit"
        className="w-full rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-600"
      >
        Send
      </button>
    </form>
  )
}

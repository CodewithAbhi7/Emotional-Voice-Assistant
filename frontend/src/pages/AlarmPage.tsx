import { useEffect } from 'react'

import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { API_BASE_URL } from '../lib/constants'
import { useAppStore } from '../store/useAppStore'
import type { Alarm } from '../store/types'
import { AlarmCard } from '../components/alarm/AlarmCard'
import { AlarmCreator } from '../components/alarm/AlarmCreator'
import { TopBar } from '../components/layout/TopBar'

export function AlarmPage() {
  const profiles = useAppStore((state) => state.profiles)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const alarms = useAppStore((state) => state.alarms)
  const setAlarms = useAppStore((state) => state.setAlarms)
  const { playBlob } = useAudioPlayer()

  const loadAlarms = async () => {
    const response = await fetch(`${API_BASE_URL}/alarms/`)
    const data = await response.json()
    const normalized = (data.alarms ?? []).map((alarm: any) => ({
      ...alarm,
      is_active: Boolean(alarm.is_active),
      auto_generate: Boolean(alarm.auto_generate),
    }))
    setAlarms(normalized)
  }

  useEffect(() => {
    void loadAlarms()
  }, [])

  const createAlarm = async (payload: {
    profile_id: string
    alarm_time: string
    days: string
    label: string
    primary_phrase?: string
    escalation_phrase_1?: string
    escalation_phrase_2?: string
    escalation_phrase_3?: string
    auto_generate: boolean
    language: string
    snooze_minutes: number
    escalation_trigger_snooze: number
  }) => {
    await fetch(`${API_BASE_URL}/alarms/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await loadAlarms()
  }

  const deleteAlarm = async (alarmId: string) => {
    await fetch(`${API_BASE_URL}/alarms/${alarmId}`, { method: 'DELETE' })
    await loadAlarms()
  }

  const simulateAlarm = async (alarm: Alarm, phase: number) => {
    const response = await fetch(`${API_BASE_URL}/alarms/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: alarm.profile_id,
        phase,
        label: alarm.label,
        primary_phrase: alarm.primary_phrase,
        phrase:
          phase === 0
            ? alarm.primary_phrase
            : phase === 1
              ? alarm.escalation_phrase_1
              : phase === 2
                ? alarm.escalation_phrase_2
                : alarm.escalation_phrase_3,
        language: alarm.language,
        auto_generate: alarm.auto_generate,
      }),
    })
    const blob = await response.blob()
    await playBlob(blob)
  }

  return (
    <div className="flex h-screen flex-col bg-eva-bg text-eva-text">
      <TopBar />
      <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[1.1fr_0.9fr]">
        <AlarmCreator
          profiles={profiles}
          activeProfileId={activeProfileId}
          onCreate={createAlarm}
        />

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Saved alarms</h2>
            <p className="mt-1 text-sm text-slate-400">
              Preview escalation phases instantly without waiting for the scheduled time.
            </p>
          </div>

          {alarms.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-eva-border bg-eva-surface/60 p-6 text-sm text-slate-500">
              No alarms yet. Create one on the left to test EVA&apos;s escalation flow.
            </div>
          ) : (
            alarms.map((alarm) => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                profile={profiles.find((profile) => profile.id === alarm.profile_id)}
                onDelete={deleteAlarm}
                onSimulate={simulateAlarm}
              />
            ))
          )}
        </section>
      </div>
    </div>
  )
}

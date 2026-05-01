import { useEffect, useState } from 'react'
import { BellPlus } from 'lucide-react'

import { ALARM_DAY_OPTIONS, LANGUAGE_OPTIONS } from '../../lib/constants'
import type { VoiceProfile } from '../../store/types'
import { EscalationBuilder } from './EscalationBuilder'

interface AlarmCreatorProps {
  profiles: VoiceProfile[]
  activeProfileId: string | null
  onCreate: (payload: {
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
  }) => Promise<void>
}

export function AlarmCreator({
  profiles,
  activeProfileId,
  onCreate,
}: AlarmCreatorProps) {
  const [profileId, setProfileId] = useState(activeProfileId ?? '')
  const [label, setLabel] = useState('Morning Alarm')
  const [alarmTime, setAlarmTime] = useState('07:00')
  const [days, setDays] = useState('ONCE')
  const [language, setLanguage] = useState('en')
  const [primaryPhrase, setPrimaryPhrase] = useState('')
  const [escalation1, setEscalation1] = useState('')
  const [escalation2, setEscalation2] = useState('')
  const [escalation3, setEscalation3] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(true)
  const [snoozeMinutes, setSnoozeMinutes] = useState(1)
  const [triggerCount, setTriggerCount] = useState(2)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setProfileId(activeProfileId ?? '')
  }, [activeProfileId])

  const handleSubmit = async () => {
    if (!profileId) {
      alert('Select a voice profile first.')
      return
    }

    setLoading(true)
    try {
      await onCreate({
        profile_id: profileId,
        alarm_time: alarmTime,
        days,
        label,
        primary_phrase: primaryPhrase || undefined,
        escalation_phrase_1: escalation1 || undefined,
        escalation_phrase_2: escalation2 || undefined,
        escalation_phrase_3: escalation3 || undefined,
        auto_generate: autoGenerate,
        language,
        snooze_minutes: snoozeMinutes,
        escalation_trigger_snooze: triggerCount,
      })
      setPrimaryPhrase('')
      setEscalation1('')
      setEscalation2('')
      setEscalation3('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-eva-border bg-eva-surface p-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Create alarm</h2>
        <p className="mt-1 text-sm text-slate-400">
          Create a wake-up, bedtime, hydration, medicine, or any other reminder.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Voice profile</span>
          <select
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          >
            <option value="">Select profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Label</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Alarm time</span>
          <input
            type="time"
            value={alarmTime}
            onChange={(event) => setAlarmTime(event.target.value)}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Repeat</span>
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          >
            {ALARM_DAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Language</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Snooze minutes</span>
          <input
            type="number"
            min={1}
            max={10}
            value={snoozeMinutes}
            onChange={(event) => setSnoozeMinutes(Number(event.target.value))}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Escalate after snoozes</span>
          <input
            type="number"
            min={1}
            max={5}
            value={triggerCount}
            onChange={(event) => setTriggerCount(Number(event.target.value))}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>
      </div>

      <EscalationBuilder
        primaryPhrase={primaryPhrase}
        escalation1={escalation1}
        escalation2={escalation2}
        escalation3={escalation3}
        autoGenerate={autoGenerate}
        onPrimaryChange={setPrimaryPhrase}
        onEscalation1Change={setEscalation1}
        onEscalation2Change={setEscalation2}
        onEscalation3Change={setEscalation3}
        onAutoGenerateChange={setAutoGenerate}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 py-3 font-medium text-white transition hover:bg-violet-600 disabled:opacity-50"
      >
        <BellPlus className="h-4 w-4" />
        {loading ? 'Creating alarm...' : 'Create alarm'}
      </button>
    </section>
  )
}

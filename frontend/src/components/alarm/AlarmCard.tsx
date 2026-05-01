import { Clock3, Play, Trash2 } from 'lucide-react'

import type { Alarm, VoiceProfile } from '../../store/types'

interface AlarmCardProps {
  alarm: Alarm
  profile?: VoiceProfile
  onDelete: (alarmId: string) => Promise<void>
  onSimulate: (alarm: Alarm, phase: number) => Promise<void>
}

export function AlarmCard({ alarm, profile, onDelete, onSimulate }: AlarmCardProps) {
  return (
    <article className="space-y-4 rounded-3xl border border-eva-border bg-eva-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white">{alarm.label}</h3>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {formatAlarmTime(alarm.alarm_time)} - {formatRepeat(alarm.days)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Voice: {profile?.display_name ?? 'Unknown'} - Language: {alarm.language}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(alarm.id)}
          className="rounded-xl border border-eva-border bg-black/20 p-2 text-slate-400 transition hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-2xl border border-eva-border bg-black/20 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Primary phrase</p>
        <p className="mt-1 text-sm text-slate-300">
          {alarm.primary_phrase || 'Auto / default phrase'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => onSimulate(alarm, phase)}
            className="flex items-center gap-2 rounded-2xl border border-eva-border bg-black/20 px-3 py-2 text-sm text-slate-300 transition hover:border-violet-500 hover:text-white"
          >
            <Play className="h-3.5 w-3.5" />
            Simulate P{phase}
          </button>
        ))}
      </div>
    </article>
  )
}

function formatRepeat(days: string) {
  if (days === 'ONCE') {
    return 'Once'
  }
  if (days === 'MON,TUE,WED,THU,FRI,SAT,SUN') {
    return 'Every day'
  }
  if (days === 'MON,TUE,WED,THU,FRI') {
    return 'Weekdays'
  }
  if (days === 'SAT,SUN') {
    return 'Weekends'
  }
  if (days.startsWith('INTERVAL:')) {
    const minutes = Number(days.split(':')[1] ?? '0')
    if (minutes === 60) {
      return 'Every hour'
    }
    return `Every ${minutes} min`
  }
  return days
}

function formatAlarmTime(value: string) {
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime()) && value.includes('T')) {
    return parsed.toLocaleString([], {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return value
}

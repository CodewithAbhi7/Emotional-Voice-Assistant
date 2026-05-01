import { AnimatePresence, motion } from 'framer-motion'
import { BellOff, Clock } from 'lucide-react'

import { useWebSocket } from '../../hooks/useWebSocket'
import { useAppStore } from '../../store/useAppStore'

const PHASE_STYLES = [
  { bg: 'from-violet-950 to-slate-900', border: 'border-violet-700', label: 'Gentle Wake-up', emoji: '🌅' },
  { bg: 'from-amber-950 to-slate-900', border: 'border-amber-700', label: 'Getting Concerned', emoji: '😟' },
  { bg: 'from-orange-950 to-slate-900', border: 'border-orange-700', label: 'Firmly Asking', emoji: '😠' },
  { bg: 'from-red-950 to-slate-900', border: 'border-red-800', label: 'Very Angry', emoji: '🔥' },
]

export function AlarmOverlay() {
  const activeAlarm = useAppStore((state) => state.activeAlarm)
  const setActiveAlarm = useAppStore((state) => state.setActiveAlarm)
  const { send } = useWebSocket()

  if (!activeAlarm || activeAlarm.phase >= 4) {
    return null
  }

  const phase = Math.min(activeAlarm.phase, 3)
  const style = PHASE_STYLES[phase]

  const dismiss = () => {
    send({ type: 'ALARM_RESPONSE', alarm_id: activeAlarm.alarm_id, action: 'DISMISS' })
    setActiveAlarm(null)
  }

  const snooze = () => {
    send({ type: 'ALARM_RESPONSE', alarm_id: activeAlarm.alarm_id, action: 'SNOOZE' })
    setActiveAlarm(null)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4"
      >
        <motion.div
          initial={{ y: 30, scale: 0.92 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 20, scale: 0.96, opacity: 0 }}
          className={`w-full max-w-sm rounded-3xl border bg-gradient-to-b p-8 text-center shadow-2xl ${style.bg} ${style.border}`}
        >
          <div className="mb-3 text-5xl">{style.emoji}</div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Phase {phase + 1} of 4
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">{style.label}</h2>
          <div className={`mt-5 rounded-2xl border bg-black/30 px-4 py-3 ${style.border}`}>
            <p className="text-sm italic leading-relaxed text-slate-200">
              &quot;{activeAlarm.phrase}&quot;
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={snooze}
              className="flex items-center justify-center gap-2 rounded-2xl border border-eva-border bg-slate-800 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
            >
              <Clock className="h-4 w-4" />
              Snooze
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-green-600"
            >
              <BellOff className="h-4 w-4" />
              Dismiss
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

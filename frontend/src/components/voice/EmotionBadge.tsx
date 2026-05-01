import { AnimatePresence, motion } from 'framer-motion'

import { useAppStore } from '../../store/useAppStore'
import type { EmotionState } from '../../store/types'

const EMOTIONS: Record<
  EmotionState,
  { label: string; emoji: string; classes: string }
> = {
  CALM: { label: 'Calm', emoji: '😌', classes: 'border-green-700 bg-green-900/40 text-green-300' },
  STRESSED: { label: 'Stressed', emoji: '😰', classes: 'border-orange-700 bg-orange-900/40 text-orange-300' },
  ANXIOUS: { label: 'Anxious', emoji: '😟', classes: 'border-yellow-700 bg-yellow-900/40 text-yellow-300' },
  SAD: { label: 'Sad', emoji: '😢', classes: 'border-blue-700 bg-blue-900/40 text-blue-300' },
  HAPPY: { label: 'Happy', emoji: '😊', classes: 'border-emerald-700 bg-emerald-900/40 text-emerald-300' },
  ANGRY: { label: 'Frustrated', emoji: '😠', classes: 'border-red-700 bg-red-900/40 text-red-300' },
  TIRED: { label: 'Tired', emoji: '😴', classes: 'border-indigo-700 bg-indigo-900/40 text-indigo-300' },
  GRIEF: { label: 'Grief', emoji: '💙', classes: 'border-slate-600 bg-slate-900/40 text-slate-300' },
}

export function EmotionBadge() {
  const currentEmotion = useAppStore((state) => state.currentEmotion)
  if (!currentEmotion) {
    return null
  }

  const config = EMOTIONS[currentEmotion.state] ?? EMOTIONS.CALM

  return (
    <AnimatePresence>
      <motion.div
        key={currentEmotion.state}
        initial={{ opacity: 0, y: -6, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.95 }}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${config.classes}`}
      >
        <span>{config.emoji}</span>
        <span>{config.label}</span>
        <span className="text-xs opacity-70">
          {Math.round(currentEmotion.confidence * 100)}%
        </span>
      </motion.div>
    </AnimatePresence>
  )
}

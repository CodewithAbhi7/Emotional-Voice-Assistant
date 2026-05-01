import { motion } from 'framer-motion'

import { useAppStore } from '../../store/useAppStore'

const BAR_COUNT = 16

export function WaveformDisplay() {
  const assistantState = useAppStore((state) => state.assistantState)
  const mode = useAppStore((state) => state.mode)

  const barColor =
    assistantState === 'SPEAKING'
      ? 'bg-pink-400'
      : assistantState === 'THINKING'
        ? 'bg-amber-400'
        : mode === 'PERSONAL'
          ? 'bg-violet-400'
          : 'bg-blue-400'

  const multiplier =
    assistantState === 'LISTENING'
      ? 1
      : assistantState === 'SPEAKING'
        ? 1.3
        : assistantState === 'THINKING'
          ? 0.75
          : 0.35

  return (
    <div className="flex h-16 items-end justify-center gap-1">
      {Array.from({ length: BAR_COUNT }).map((_, index) => {
        const baseHeight = 10 + ((index % 5) + 1) * 6 * multiplier
        return (
          <motion.div
            key={index}
            className={`w-1.5 rounded-full ${barColor}`}
            animate={{
              height: [baseHeight, baseHeight + 8 * multiplier, baseHeight],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 0.7,
              repeat: Infinity,
              delay: index * 0.05,
            }}
          />
        )
      })}
    </div>
  )
}

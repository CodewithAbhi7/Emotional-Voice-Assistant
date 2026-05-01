import { motion } from 'framer-motion'
import { Briefcase, Heart } from 'lucide-react'

import { useWebSocket } from '../../hooks/useWebSocket'
import { useAppStore } from '../../store/useAppStore'

export function ModeToggle() {
  const mode = useAppStore((state) => state.mode)
  const setMode = useAppStore((state) => state.setMode)
  const { send } = useWebSocket()
  const isProfessional = mode === 'PROFESSIONAL'

  const toggle = () => {
    const next = isProfessional ? 'PERSONAL' : 'PROFESSIONAL'
    setMode(next)
    send({ type: 'SWITCH_MODE', mode: next })
  }

  return (
    <button
      onClick={toggle}
      className="relative flex items-center gap-1 rounded-full border border-eva-border bg-eva-surface p-1"
      type="button"
    >
      <motion.div
        className={`absolute top-1 h-8 w-[calc(50%-4px)] rounded-full ${
          isProfessional ? 'bg-blue-600' : 'bg-violet-600'
        }`}
        animate={{ left: isProfessional ? 'calc(50% + 2px)' : '4px' }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      />
      <div
        className={`relative z-10 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
          !isProfessional ? 'text-white' : 'text-slate-500'
        }`}
      >
        <Heart className="h-3.5 w-3.5" />
        <span>Personal</span>
      </div>
      <div
        className={`relative z-10 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
          isProfessional ? 'text-white' : 'text-slate-500'
        }`}
      >
        <Briefcase className="h-3.5 w-3.5" />
        <span>Work</span>
      </div>
    </button>
  )
}

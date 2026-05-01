import { AnimatePresence, motion } from 'framer-motion'
import { HeartHandshake, X } from 'lucide-react'

import { useAppStore } from '../../store/useAppStore'

export function CrisisAlert() {
  const crisisAlert = useAppStore((state) => state.crisisAlert)
  const setCrisisAlert = useAppStore((state) => state.setCrisisAlert)

  return (
    <AnimatePresence>
      {crisisAlert && (
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          className="fixed left-1/2 top-4 z-50 w-full max-w-md -translate-x-1/2 px-4"
        >
          <div
            className={`rounded-2xl border p-4 shadow-2xl ${
              crisisAlert.risk_level === 'HIGH'
                ? 'border-red-700 bg-red-950'
                : 'border-blue-700 bg-blue-950'
            }`}
          >
            <div className="flex items-start gap-3">
              <HeartHandshake className="mt-0.5 h-5 w-5 flex-shrink-0 text-white" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  {crisisAlert.risk_level === 'HIGH'
                    ? "You're not alone. Help is available."
                    : "It sounds like you're going through something heavy."}
                </p>
                <p className="mt-1 text-xs text-slate-300">{crisisAlert.helpline}</p>
              </div>
              <button
                type="button"
                onClick={() => setCrisisAlert(null)}
                className="text-slate-400 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

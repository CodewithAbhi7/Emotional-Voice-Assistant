import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Mic, MicOff } from 'lucide-react'

import { useAudioCapture } from '../../hooks/useAudioCapture'
import { useAppStore } from '../../store/useAppStore'

interface VoiceOrbProps {
  profileId: string | null
}

const variants = {
  idle: {
    scale: [1, 1.04, 1],
    opacity: [0.82, 1, 0.82],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1.02, 1.15, 1.05],
    transition: { duration: 0.55, repeat: Infinity, ease: 'easeInOut' },
  },
  thinking: {
    scale: 1.04,
    transition: { duration: 0.2 },
  },
  speaking: {
    scale: [1.04, 1.14, 1.08, 1.16, 1.04],
    transition: { duration: 0.4, repeat: Infinity },
  },
  error: {
    scale: [1, 1.06, 1],
    transition: { duration: 0.35, repeat: 2 },
  },
}

export function VoiceOrb({ profileId }: VoiceOrbProps) {
  const assistantState = useAppStore((state) => state.assistantState)
  const mode = useAppStore((state) => state.mode)
  const statusMessage = useAppStore((state) => state.statusMessage)
  const liveTranscription = useAppStore((state) => state.liveTranscription)
  const { isRecording, startRecording, stopRecording } = useAudioCapture()

  const variant = assistantState.toLowerCase() as keyof typeof variants
  const isPersonal = mode === 'PERSONAL'

  const handleClick = async () => {
    if (!profileId && isPersonal) {
      alert('Please create a voice profile first.')
      return
    }
    if (assistantState === 'THINKING' || assistantState === 'SPEAKING') {
      return
    }
    if (isRecording) {
      stopRecording()
    } else {
      await startRecording(profileId)
    }
  }

  const baseColor =
    isRecording
      ? 'bg-red-600'
      : assistantState === 'SPEAKING'
      ? 'bg-pink-600'
      : assistantState === 'THINKING'
        ? 'bg-amber-600'
        : assistantState === 'ERROR'
          ? 'bg-red-600'
          : isPersonal
            ? 'bg-violet-700'
            : 'bg-blue-700'

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex items-center justify-center">
        {assistantState === 'LISTENING' ? (
          <>
            <motion.div
              className="absolute rounded-full border border-violet-500/30"
              initial={{ width: 180, height: 180, opacity: 0.6 }}
              animate={{ width: 250, height: 250, opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="absolute rounded-full border border-violet-500/20"
              initial={{ width: 180, height: 180, opacity: 0.4 }}
              animate={{ width: 290, height: 290, opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
            />
          </>
        ) : null}

        {assistantState === 'THINKING' ? (
          <motion.div
            className="absolute h-56 w-56 rounded-full border-2 border-amber-300/20 border-t-amber-300"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        ) : null}

        <motion.button
          type="button"
          onClick={handleClick}
          variants={variants}
          animate={variant}
          disabled={assistantState === 'THINKING' || assistantState === 'SPEAKING'}
          className={`relative flex h-44 w-44 items-center justify-center rounded-full transition ${baseColor}`}
          style={{
            boxShadow:
              isRecording
                ? '0 0 60px rgba(220,38,38,0.65)'
                : assistantState === 'LISTENING'
                ? '0 0 60px rgba(124,58,237,0.7)'
                : assistantState === 'SPEAKING'
                  ? '0 0 60px rgba(236,72,153,0.7)'
                  : isPersonal
                    ? '0 0 35px rgba(124,58,237,0.45)'
                    : '0 0 35px rgba(59,130,246,0.45)',
          }}
          whileTap={{ scale: 0.97 }}
        >
          <AnimatePresence mode="wait">
            {assistantState === 'THINKING' ? (
              <motion.div
                key="thinking"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Loader2 className="h-14 w-14 animate-spin text-white" />
              </motion.div>
            ) : (
              <motion.div
                key={isRecording ? 'recording' : 'idle'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                {isRecording ? (
                  <MicOff className="h-12 w-12 text-white" />
                ) : (
                  <Mic className="h-12 w-12 text-white" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      <motion.p
        key={assistantState}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm font-medium text-slate-300"
      >
        {statusMessage || (assistantState === 'IDLE' ? 'Tap to speak' : assistantState)}
      </motion.p>

      {liveTranscription ? (
        <p className="max-w-xs text-center text-xs text-slate-400">
          Heard: {liveTranscription}
        </p>
      ) : null}
    </div>
  )
}

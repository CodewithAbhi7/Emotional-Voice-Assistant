import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Play } from 'lucide-react'

import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { API_BASE_URL } from '../../lib/constants'

interface TestStepProps {
  profileId: string
  displayName: string
  language: string
  onComplete: () => void
}

export function TestStep({
  profileId,
  displayName,
  language,
  onComplete,
}: TestStepProps) {
  const [text, setText] = useState(
    "Good morning! I'm so glad to speak with you today.",
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { playBlob, isPlaying } = useAudioPlayer()

  const synthesize = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/profiles/${profileId}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language,
          warmth: 0.8,
          urgency: 0.2,
          anger: 0,
        }),
      })
      if (!response.ok) {
        let message = 'Voice synthesis failed.'
        try {
          const data = await response.json()
          message = data.detail ?? data.message ?? message
        } catch {
          message = await response.text() || message
        }
        throw new Error(message)
      }
      const blob = await response.blob()
      await playBlob(blob)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to fetch the synthesized audio.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      className="space-y-5 rounded-3xl border border-eva-border bg-eva-surface p-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-white">Test the cloned voice</h2>
        <p className="mt-1 text-sm text-slate-400">
          Hear how EVA sounds in {displayName}&apos;s voice before you enter the main app.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-24 w-full resize-none rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
      />

      <button
        type="button"
        onClick={synthesize}
        disabled={loading}
        className="flex items-center gap-2 rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-600 disabled:opacity-50"
      >
        <Play className="h-4 w-4" />
        {loading ? 'Synthesizing...' : isPlaying ? 'Playing...' : `Hear ${displayName}'s voice`}
      </button>

      <button
        type="button"
        onClick={onComplete}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3 font-medium text-white transition hover:bg-green-600"
      >
        <Check className="h-4 w-4" />
        Looks great! Start using EVA
      </button>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </motion.div>
  )
}

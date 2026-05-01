import { motion } from 'framer-motion'
import { ChevronRight, Mic, MicOff, Upload } from 'lucide-react'

interface RecordStepProps {
  audioBlob: Blob | null
  isRecording: boolean
  loading: boolean
  error: string
  onStartRecording: () => Promise<void>
  onStopRecording: () => void
  onFileUpload: (file: File) => void
  onContinue: () => void
}

export function RecordStep({
  audioBlob,
  isRecording,
  loading,
  error,
  onStartRecording,
  onStopRecording,
  onFileUpload,
  onContinue,
}: RecordStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      className="space-y-5 rounded-3xl border border-eva-border bg-eva-surface p-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-white">Record a voice sample</h2>
        <p className="mt-1 text-sm text-slate-400">
          Capture 10 to 20 seconds of natural speech. A short story or a casual message works best.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 py-4">
        <button
          type="button"
          onClick={isRecording ? onStopRecording : onStartRecording}
          className={`flex h-24 w-24 items-center justify-center rounded-full transition ${
            isRecording
              ? 'animate-pulse bg-red-600 shadow-lg shadow-red-600/40'
              : 'bg-violet-700 hover:bg-violet-600'
          }`}
        >
          {isRecording ? (
            <MicOff className="h-10 w-10 text-white" />
          ) : (
            <Mic className="h-10 w-10 text-white" />
          )}
        </button>
        <p className="text-sm text-slate-400">
          {isRecording ? 'Recording... tap to stop' : 'Tap to start recording'}
        </p>
      </div>

      {audioBlob ? (
        <div className="rounded-2xl border border-green-700 bg-green-900/30 p-3 text-sm text-green-300">
          Audio ready ({Math.round(audioBlob.size / 1024)} KB)
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-eva-border" />
        <span className="text-xs text-slate-600">or upload a file</span>
        <div className="h-px flex-1 bg-eva-border" />
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-eva-border p-3 text-sm text-slate-400 transition hover:border-violet-500">
        <Upload className="h-4 w-4" />
        Upload audio file
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              onFileUpload(file)
            }
          }}
        />
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="button"
        disabled={!audioBlob || loading}
        onClick={onContinue}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 py-3 font-medium text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Analyzing...' : 'Continue'}
        <ChevronRight className="h-4 w-4" />
      </button>
    </motion.div>
  )
}

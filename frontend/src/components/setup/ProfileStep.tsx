import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

import { LANGUAGE_OPTIONS, RELATIONSHIP_OPTIONS } from '../../lib/constants'

interface ProfileStepProps {
  validation: { quality: number; warning?: string | null } | null
  relationship: string
  displayName: string
  language: string
  consent: boolean
  loading: boolean
  error: string
  onRelationshipChange: (value: string) => void
  onDisplayNameChange: (value: string) => void
  onLanguageChange: (value: string) => void
  onConsentChange: (value: boolean) => void
  onCreate: () => void
}

export function ProfileStep({
  validation,
  relationship,
  displayName,
  language,
  consent,
  loading,
  error,
  onRelationshipChange,
  onDisplayNameChange,
  onLanguageChange,
  onConsentChange,
  onCreate,
}: ProfileStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      className="space-y-5 rounded-3xl border border-eva-border bg-eva-surface p-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-white">Configure the profile</h2>
        <p className="mt-1 text-sm text-slate-400">
          Tell EVA who this voice belongs to and how it should feel in the app.
        </p>
      </div>

      {validation ? (
        <div
          className={`rounded-2xl border p-3 text-sm ${
            validation.quality > 0.6
              ? 'border-green-700 bg-green-900/30 text-green-300'
              : 'border-amber-700 bg-amber-900/30 text-amber-300'
          }`}
        >
          Quality score: {Math.round(validation.quality * 100)}%
          {validation.warning ? ` - ${validation.warning}` : ''}
        </div>
      ) : null}

      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-slate-400">Relationship</span>
          <select
            value={relationship}
            onChange={(event) => onRelationshipChange(event.target.value)}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          >
            {RELATIONSHIP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-slate-400">What do you call them?</span>
          <input
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="e.g. Ma, Baba, Didi, Coach"
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-slate-400">Language</span>
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
            className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
            className="mt-1 h-4 w-4 accent-violet-600"
          />
          <span className="text-sm text-slate-400">
            I confirm that <span className="font-medium text-slate-200">{displayName || 'this person'}</span> has
            given explicit consent for their voice to be used in EVA.
          </span>
        </label>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="button"
        onClick={onCreate}
        disabled={loading || !consent || !displayName.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 py-3 font-medium text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creating...' : `Create ${displayName || 'Profile'}`}
        <ChevronRight className="h-4 w-4" />
      </button>
    </motion.div>
  )
}

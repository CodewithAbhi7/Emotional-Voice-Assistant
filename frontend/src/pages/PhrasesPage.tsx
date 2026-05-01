import { useEffect, useState } from 'react'
import { Loader2, Play, Plus, Trash2 } from 'lucide-react'

import { TopBar } from '../components/layout/TopBar'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { API_BASE_URL, LANGUAGE_OPTIONS, PHRASE_TYPES } from '../lib/constants'
import { useAppStore } from '../store/useAppStore'

export function PhrasesPage() {
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const phrases = useAppStore((state) => state.phrases)
  const setPhrases = useAppStore((state) => state.setPhrases)
  const { playBlob } = useAudioPlayer()

  const [text, setText] = useState('')
  const [phraseType, setPhraseType] = useState(PHRASE_TYPES[0].value)
  const [language, setLanguage] = useState('en')
  const [saving, setSaving] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  const loadPhrases = async () => {
    if (!activeProfileId) {
      setPhrases([])
      return
    }
    const response = await fetch(
      `${API_BASE_URL}/phrases/?profile_id=${encodeURIComponent(activeProfileId)}`,
    )
    const data = await response.json()
    setPhrases(data.phrases ?? [])
  }

  useEffect(() => {
    void loadPhrases()
  }, [activeProfileId])

  const savePhrase = async () => {
    if (!activeProfileId || !text.trim()) {
      return
    }
    setSaving(true)
    try {
      const config = PHRASE_TYPES.find((item) => item.value === phraseType)!
      await fetch(`${API_BASE_URL}/phrases/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: activeProfileId,
          phrase_type: phraseType,
          text: text.trim(),
          language,
          warmth: config.warmth,
          urgency: config.urgency,
          anger: phraseType === 'ALARM_ESCALATION_3' ? 0.75 : 0,
        }),
      })
      setText('')
      await loadPhrases()
    } finally {
      setSaving(false)
    }
  }

  const previewPhrase = async (phraseId: string) => {
    setPreviewingId(phraseId)
    try {
      const response = await fetch(`${API_BASE_URL}/phrases/${phraseId}/preview`)
      const blob = await response.blob()
      await playBlob(blob)
    } finally {
      setPreviewingId(null)
    }
  }

  const deletePhrase = async (phraseId: string) => {
    await fetch(`${API_BASE_URL}/phrases/${phraseId}`, { method: 'DELETE' })
    await loadPhrases()
  }

  return (
    <div className="flex h-screen flex-col bg-eva-bg text-eva-text">
      <TopBar />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        <section className="space-y-5 rounded-3xl border border-eva-border bg-eva-surface p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Add new phrase</h2>
            <p className="mt-1 text-sm text-slate-400">
              Write phrases in any language or script and preview them in the cloned voice.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs text-slate-500">Phrase type</span>
              <select
                value={phraseType}
                onChange={(event) => setPhraseType(event.target.value)}
                className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              >
                {PHRASE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs text-slate-500">Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="w-full rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs text-slate-500">Phrase text</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type your phrase here..."
              className="h-24 w-full resize-none rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
            />
          </label>

          <button
            type="button"
            onClick={savePhrase}
            disabled={!activeProfileId || !text.trim() || saving}
            className="flex items-center gap-2 rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save phrase'}
          </button>
        </section>

        <section className="space-y-4">
          {phrases.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-eva-border bg-eva-surface/60 p-6 text-sm text-slate-500">
              No phrases yet. Create your first custom phrase above.
            </div>
          ) : (
            phrases.map((phrase) => {
              const typeMeta = PHRASE_TYPES.find((item) => item.value === phrase.phrase_type)
              return (
                <article
                  key={phrase.id}
                  className="flex items-start gap-4 rounded-3xl border border-eva-border bg-eva-surface p-5"
                >
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wide text-violet-400">
                      {typeMeta?.label ?? phrase.phrase_type}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-200">{phrase.text}</p>
                    <p className="mt-2 text-xs text-slate-500">{phrase.language}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => previewPhrase(phrase.id)}
                      className="rounded-2xl border border-eva-border bg-black/20 p-2 text-slate-400 transition hover:text-violet-300"
                    >
                      {previewingId === phrase.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePhrase(phrase.id)}
                      className="rounded-2xl border border-eva-border bg-black/20 p-2 text-slate-400 transition hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}

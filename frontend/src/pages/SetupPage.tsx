import { useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { API_BASE_URL } from '../lib/constants'
import { encodeWavFromFloatChunks } from '../lib/audio'
import { useAppStore } from '../store/useAppStore'
import { ProfileStep } from '../components/setup/ProfileStep'
import { RecordStep } from '../components/setup/RecordStep'
import { TestStep } from '../components/setup/TestStep'

type Step = 'RECORD' | 'CONFIGURE' | 'TEST'

export function SetupPage() {
  const navigate = useNavigate()
  const profiles = useAppStore((state) => state.profiles)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const setProfiles = useAppStore((state) => state.setProfiles)
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId)
  const setSetupComplete = useAppStore((state) => state.setSetupComplete)
  const clearMessages = useAppStore((state) => state.clearMessages)

  const [step, setStep] = useState<Step>('RECORD')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [validation, setValidation] = useState<{ quality: number; warning?: string | null } | null>(null)
  const [relationship, setRelationship] = useState('MOM')
  const [displayName, setDisplayName] = useState('')
  const [language, setLanguage] = useState('en')
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const sampleRateRef = useRef<number>(44100)

  const refreshProfiles = async () => {
    const profilesResponse = await fetch(`${API_BASE_URL}/profiles/`)
    const profilesData = await profilesResponse.json()
    const loadedProfiles = profilesData.profiles ?? []
    const nextActiveProfileId =
      loadedProfiles.some((profile: { id: string }) => profile.id === activeProfileId)
        ? activeProfileId
        : loadedProfiles[0]?.id ?? null

    setProfiles(loadedProfiles)
    setActiveProfileId(nextActiveProfileId)

    if (loadedProfiles.length > 0) {
      setSetupComplete(true)
    } else {
      setActiveProfileId(null)
      setSetupComplete(false)
      clearMessages()
    }

    return loadedProfiles
  }

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const zeroGain = context.createGain()
      zeroGain.gain.value = 0

      chunksRef.current = []
      sampleRateRef.current = context.sampleRate

      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0)
        chunksRef.current.push(new Float32Array(samples))
      }

      source.connect(processor)
      processor.connect(zeroGain)
      zeroGain.connect(context.destination)

      streamRef.current = stream
      contextRef.current = context
      sourceRef.current = source
      processorRef.current = processor
      setIsRecording(true)
    } catch (caught) {
      setError('Microphone permission is required to record a sample.')
    }
  }

  const stopRecording = () => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    contextRef.current?.close()

    const wavBlob = encodeWavFromFloatChunks(chunksRef.current, sampleRateRef.current)
    setAudioBlob(wavBlob)

    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    contextRef.current = null
    setIsRecording(false)
  }

  const validateAndProceed = async () => {
    if (!audioBlob) {
      setError('Please record or upload audio first.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const form = new FormData()
      const uploadName = audioBlob instanceof File ? audioBlob.name : 'sample.wav'
      form.append('file', audioBlob, uploadName)

      const uploadResponse = await fetch(`${API_BASE_URL}/upload-temp`, {
        method: 'POST',
        body: form,
      })
      const uploadData = await uploadResponse.json()
      setAudioPath(uploadData.path)

      const validationResponse = await fetch(`${API_BASE_URL}/profiles/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_path: uploadData.path }),
      })
      const validationData = await validationResponse.json()

      if (!validationResponse.ok || !validationData.valid) {
        throw new Error(validationData.detail ?? validationData.error ?? 'Audio validation failed')
      }

      setValidation(validationData)
      setStep('CONFIGURE')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const createProfile = async () => {
    if (!audioPath) {
      setError('Please validate the sample first.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/profiles/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: audioPath,
          relationship,
          display_name: displayName,
          language,
          consent,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.detail ?? 'Profile creation failed')
      }

      setProfileId(result.id)
      await refreshProfiles()
      setActiveProfileId(result.id)
      setStep('TEST')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const complete = () => {
    setSetupComplete(true)
    navigate('/')
  }

  const deleteProfile = async (id: string) => {
    const target = profiles.find((profile) => profile.id === id)
    if (!target) {
      return
    }

    const confirmed = window.confirm(
      `Delete ${target.display_name}'s persona? This will also remove its alarms and saved phrase previews.`,
    )
    if (!confirmed) {
      return
    }

    setDeleteLoadingId(id)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/profiles/${id}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.detail ?? 'Could not delete persona')
      }

      const remaining = await refreshProfiles()
      if (profileId === id) {
        setProfileId(null)
        setStep('RECORD')
      }
      if (remaining.length === 0) {
        setAudioBlob(null)
        setAudioPath(null)
        setValidation(null)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete persona')
    } finally {
      setDeleteLoadingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-eva-bg px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">
            {profiles.length > 0 ? 'Voice Settings' : 'Welcome to EVA'}
          </h1>
          <p className="mt-2 text-slate-400">
            {profiles.length > 0
              ? 'Manage your personas here, or create another familiar voice for EVA.'
              : 'Set up a voice profile so the assistant can respond in a familiar voice.'}
          </p>
        </div>

        {profiles.length > 0 ? (
          <div className="mb-8 space-y-3 rounded-3xl border border-eva-border bg-eva-surface p-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Saved personas</h2>
              <p className="mt-1 text-sm text-slate-400">
                Switch between personas from the top bar, or delete one here.
              </p>
            </div>

            <div className="space-y-3">
              {profiles.map((profile) => {
                const isActive = profile.id === activeProfileId
                const isDeleting = deleteLoadingId === profile.id

                return (
                  <div
                    key={profile.id}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                      isActive
                        ? 'border-violet-500/60 bg-violet-900/20'
                        : 'border-eva-border bg-eva-bg'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-white">{profile.display_name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                        {profile.relationship} · {Math.round((profile.quality ?? 0) * 100)}%
                        {isActive ? ' · Active' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => setActiveProfileId(profile.id)}
                          className="rounded-xl border border-eva-border px-3 py-2 text-sm text-slate-200 transition hover:border-violet-500 hover:text-white"
                        >
                          Use
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => deleteProfile(profile.id)}
                        disabled={isDeleting}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="mb-8 flex items-center justify-center gap-3">
          {(['RECORD', 'CONFIGURE', 'TEST'] as Step[]).map((item, index) => (
            <div key={item} className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${
                  step === item
                    ? 'border-violet-500 bg-violet-600 text-white'
                    : ['RECORD', 'CONFIGURE', 'TEST'].indexOf(step) > index
                      ? 'border-green-600 bg-green-700 text-white'
                      : 'border-eva-border bg-eva-surface text-slate-500'
                }`}
              >
                {index + 1}
              </div>
              {index < 2 ? <div className="h-px w-10 bg-eva-border" /> : null}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 'RECORD' ? (
            <RecordStep
              key="record"
              audioBlob={audioBlob}
              isRecording={isRecording}
              loading={loading}
              error={error}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onFileUpload={(file) => setAudioBlob(file)}
              onContinue={validateAndProceed}
            />
          ) : null}

          {step === 'CONFIGURE' ? (
            <ProfileStep
              key="configure"
              validation={validation}
              relationship={relationship}
              displayName={displayName}
              language={language}
              consent={consent}
              loading={loading}
              error={error}
              onRelationshipChange={setRelationship}
              onDisplayNameChange={setDisplayName}
              onLanguageChange={setLanguage}
              onConsentChange={setConsent}
              onCreate={createProfile}
            />
          ) : null}

          {step === 'TEST' && profileId ? (
            <TestStep
              key="test"
              profileId={profileId}
              displayName={displayName}
              language={language}
              onComplete={complete}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

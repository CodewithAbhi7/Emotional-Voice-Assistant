import { useCallback, useEffect, useRef, useState } from 'react'

import { float32ToPcm16 } from '../lib/audio'
import type { VoiceProfile } from '../store/types'
import { useAppStore } from '../store/useAppStore'
import { useWebSocket } from './useWebSocket'

const SAMPLE_RATE = 16000
const PROCESSOR_BUFFER_SIZE = 2048
const GENERIC_WAKE_WORDS = ['eva', 'hey eva', 'ok eva', 'okay eva']

type RecognitionMode = 'idle' | 'wake' | 'manual'
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      length: number
      [altIndex: number]: { transcript: string }
    }
  }
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface WakeMatch {
  profileId: string | null
  remainder: string
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const PROFILE_LANGUAGE_TO_BCP47: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
}

const RELATIONSHIP_WAKE_WORDS: Record<string, string[]> = {
  MOM: ['mom', 'mother', 'mummy', 'mum', 'maa', 'amma'],
  DAD: ['dad', 'father', 'papa', 'abba', 'appa'],
  SIBLING: ['bro', 'brother', 'sis', 'sister', 'bhai', 'didi'],
  MENTOR: ['mentor', 'coach', 'teacher', 'sir', 'maam'],
  FRIEND: ['friend', 'buddy', 'yaar'],
  CUSTOM: [],
}

const GENERIC_WAKE_ALIASES = uniqueStrings([
  ...GENERIC_WAKE_WORDS,
  ...Object.values(RELATIONSHIP_WAKE_WORDS).flat(),
])

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function profileWakeAliases(profile: VoiceProfile) {
  const displayName = profile.display_name.trim().toLowerCase()
  const aliases = [displayName, ...(RELATIONSHIP_WAKE_WORDS[profile.relationship] ?? [])]

  for (const group of Object.values(RELATIONSHIP_WAKE_WORDS)) {
    if (displayName && group.includes(displayName)) {
      aliases.push(...group)
    }
  }

  return uniqueStrings(aliases)
}

export function useAudioCapture() {
  const { send, sendAudio } = useWebSocket()
  const assistantState = useAppStore((state) => state.assistantState)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const profiles = useAppStore((state) => state.profiles)
  const [isRecording, setIsRecording] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const zeroGainRef = useRef<GainNode | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recognitionModeRef = useRef<RecognitionMode>('idle')
  const recognitionTranscriptRef = useRef('')
  const interimTranscriptRef = useRef('')
  const manualProfileIdRef = useRef<string | null>(activeProfileId)
  const manualStopRequestedRef = useRef(false)
  const wakeRestartTimerRef = useRef<number | null>(null)
  const manualFinalizeTimerRef = useRef<number | null>(null)

  const profilesRef = useRef(profiles)
  const activeProfileIdRef = useRef(activeProfileId)
  const assistantStateRef = useRef(assistantState)

  useEffect(() => {
    profilesRef.current = profiles
  }, [profiles])

  useEffect(() => {
    activeProfileIdRef.current = activeProfileId
    manualProfileIdRef.current = activeProfileId
  }, [activeProfileId])

  useEffect(() => {
    assistantStateRef.current = assistantState
  }, [assistantState])

  const getRecognitionCtor = useCallback(
    () => window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null,
    [],
  )

  const buildIdlePrompt = useCallback(() => {
    if (getRecognitionCtor()) {
      return 'Say EVA or a saved wake word, or tap to speak'
    }
    return 'Tap to speak'
  }, [getRecognitionCtor])

  const setIdleStatus = useCallback(() => {
    useAppStore.getState().setAssistantState('IDLE', buildIdlePrompt())
  }, [buildIdlePrompt])

  const clearWakeRestart = useCallback(() => {
    if (wakeRestartTimerRef.current !== null) {
      window.clearTimeout(wakeRestartTimerRef.current)
      wakeRestartTimerRef.current = null
    }
  }, [])

  const clearManualFinalizeTimer = useCallback(() => {
    if (manualFinalizeTimerRef.current !== null) {
      window.clearTimeout(manualFinalizeTimerRef.current)
      manualFinalizeTimerRef.current = null
    }
  }, [])

  const resolveProfile = useCallback((profileId: string | null) => {
    if (!profileId) {
      return null
    }
    return profilesRef.current.find((item) => item.id === profileId) ?? null
  }, [])

  const resolveValidProfileId = useCallback(
    (candidate: string | null) =>
      resolveProfile(candidate)?.id ??
      resolveProfile(activeProfileIdRef.current)?.id ??
      profilesRef.current[0]?.id ??
      null,
    [resolveProfile],
  )

  const resolveRecognitionLanguage = useCallback(
    (profileId: string | null) => {
      const profile =
        resolveProfile(profileId) ??
        resolveProfile(activeProfileIdRef.current) ??
        profilesRef.current[0] ??
        null
      return PROFILE_LANGUAGE_TO_BCP47[profile?.language ?? 'en'] ?? navigator.language ?? 'en-US'
    },
    [resolveProfile],
  )

  const extractTranscript = useCallback((event: SpeechRecognitionEventLike) => {
    let finalTranscript = ''
    let interimTranscript = ''

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result[0]?.transcript?.trim() ?? ''
      if (!transcript) {
        continue
      }
      if (result.isFinal) {
        finalTranscript = `${finalTranscript} ${transcript}`.trim()
      } else {
        interimTranscript = `${interimTranscript} ${transcript}`.trim()
      }
    }

    return { finalTranscript, interimTranscript }
  }, [])

  const stopRawRecording = useCallback(() => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    zeroGainRef.current?.disconnect()

    streamRef.current?.getTracks().forEach((track) => track.stop())
    contextRef.current?.close()

    streamRef.current = null
    contextRef.current = null
    sourceRef.current = null
    processorRef.current = null
    zeroGainRef.current = null
  }, [])

  const queueWakeWordListening = useCallback(() => {
    clearWakeRestart()

    if (!getRecognitionCtor()) {
      return
    }

    if (recognitionModeRef.current !== 'idle' || isRecording) {
      return
    }

    if (!['IDLE', 'ERROR'].includes(assistantStateRef.current)) {
      return
    }

    wakeRestartTimerRef.current = window.setTimeout(() => {
      wakeRestartTimerRef.current = null
      if (recognitionModeRef.current === 'idle' && !isRecording) {
        void startWakeWordListening()
      }
    }, 600)
  }, [clearWakeRestart, getRecognitionCtor, isRecording])

  const finalizeManualTranscript = useCallback(() => {
    clearManualFinalizeTimer()
    const transcript = `${recognitionTranscriptRef.current} ${interimTranscriptRef.current}`.trim()
    recognitionTranscriptRef.current = ''
    interimTranscriptRef.current = ''
    manualStopRequestedRef.current = false
    setIsRecording(false)

    if (transcript) {
      useAppStore.getState().setLiveTranscription(transcript)
      useAppStore.getState().setAssistantState('THINKING', 'EVA is thinking...')
      send({
        type: 'TEXT_INPUT',
        text: transcript,
        profile_id: manualProfileIdRef.current,
      })
      return
    }

    useAppStore.getState().setLiveTranscription('')
    setIdleStatus()
  }, [clearManualFinalizeTimer, send, setIdleStatus])

  const stopRecognitionSession = useCallback(
    (finalizeManual = false) => {
      clearWakeRestart()
      clearManualFinalizeTimer()

      if (recognitionModeRef.current === 'manual') {
        manualStopRequestedRef.current = finalizeManual
        if (finalizeManual) {
          setIsRecording(false)
          useAppStore.getState().setAssistantState('THINKING', 'Processing your speech...')
          manualFinalizeTimerRef.current = window.setTimeout(() => {
            if (manualStopRequestedRef.current && recognitionModeRef.current === 'manual') {
              recognitionModeRef.current = 'idle'
              recognitionRef.current = null
              finalizeManualTranscript()
            }
          }, 500)
        }
      } else {
        recognitionModeRef.current = 'idle'
      }

      const recognition = recognitionRef.current
      if (!recognition) {
        if (finalizeManual) {
          finalizeManualTranscript()
        }
        return
      }

      try {
        recognition.stop()
      } catch (error) {
        console.debug('Recognition stop failed', error)
        recognitionRef.current = null
        if (finalizeManual) {
          recognitionModeRef.current = 'idle'
          finalizeManualTranscript()
        }
      }
    },
    [clearManualFinalizeTimer, clearWakeRestart, finalizeManualTranscript],
  )

  const findWakeMatch = useCallback(
    (rawTranscript: string): WakeMatch | null => {
      const transcript = normalizeText(rawTranscript)
      if (!transcript) {
        return null
      }

      const currentProfiles = profilesRef.current
      const prioritizedProfiles = [...currentProfiles].sort((left, right) => {
        if (left.id === activeProfileIdRef.current) {
          return -1
        }
        if (right.id === activeProfileIdRef.current) {
          return 1
        }
        return 0
      })

      for (const profile of prioritizedProfiles) {
        for (const alias of profileWakeAliases(profile)) {
          const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`)
          const match = transcript.match(pattern)
          if (match?.index !== undefined) {
            const remainder = transcript.slice(match.index + match[0].length).trim()
            return { profileId: profile.id, remainder }
          }
        }
      }

      for (const wakeWord of GENERIC_WAKE_ALIASES) {
        const genericPattern = new RegExp(`\\b${escapeRegExp(wakeWord)}\\b`)
        const genericMatch = transcript.match(genericPattern)
        if (genericMatch?.index !== undefined) {
          const remainder = transcript.slice(genericMatch.index + genericMatch[0].length).trim()
          return {
            profileId: resolveValidProfileId(activeProfileIdRef.current),
            remainder,
          }
        }
      }

      return null
    },
    [resolveValidProfileId],
  )

  const startManualRecognition = useCallback(
    async (profileId: string | null, seededTranscript = '') => {
      const RecognitionCtor = getRecognitionCtor()
      const store = useAppStore.getState()
      const selectedProfileId = resolveValidProfileId(profileId)

      if (RecognitionCtor) {
        stopRecognitionSession(false)

        const recognition = new RecognitionCtor()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1
        recognition.lang = resolveRecognitionLanguage(selectedProfileId)

        recognitionModeRef.current = 'manual'
        recognitionRef.current = recognition
        recognitionTranscriptRef.current = seededTranscript.trim()
        interimTranscriptRef.current = ''
        manualProfileIdRef.current = selectedProfileId
        manualStopRequestedRef.current = false

        store.setLiveTranscription(recognitionTranscriptRef.current)
        store.setAssistantState('LISTENING', 'Recording... tap to stop')
        setIsRecording(true)

        recognition.onresult = (event) => {
          const { finalTranscript, interimTranscript } = extractTranscript(event)
          const combinedFinal = `${recognitionTranscriptRef.current} ${finalTranscript}`.trim()
          recognitionTranscriptRef.current = combinedFinal
          interimTranscriptRef.current = interimTranscript

          store.setLiveTranscription(
            `${recognitionTranscriptRef.current} ${interimTranscriptRef.current}`.trim(),
          )
        }

        recognition.onerror = (event) => {
          console.error('Speech recognition failed', event.error)
          recognitionRef.current = null
          const wasManual = recognitionModeRef.current === 'manual'
          recognitionModeRef.current = 'idle'

          if (wasManual && manualStopRequestedRef.current) {
            finalizeManualTranscript()
            return
          }

          setIsRecording(false)
          store.setLiveTranscription('')
          store.setAssistantState('ERROR', `Speech recognition failed: ${event.error}`)
          queueWakeWordListening()
        }

        recognition.onend = () => {
          recognitionRef.current = null

          if (recognitionModeRef.current !== 'manual') {
            return
          }

          if (manualStopRequestedRef.current) {
            recognitionModeRef.current = 'idle'
            finalizeManualTranscript()
            return
          }

          window.setTimeout(() => {
            void startManualRecognition(manualProfileIdRef.current, recognitionTranscriptRef.current)
          }, 150)
        }

        try {
          recognition.start()
          return
        } catch (error) {
          console.debug('Speech recognition start failed, falling back to audio streaming', error)
          recognitionRef.current = null
          recognitionModeRef.current = 'idle'
          setIsRecording(false)
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support microphone capture on the current page.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const context = new AudioContext({ sampleRate: SAMPLE_RATE })
      await context.resume()
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
      const zeroGain = context.createGain()
      zeroGain.gain.value = 0

      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0)
        const pcm16 = float32ToPcm16(samples)
        const payload = new Uint8Array(pcm16.byteLength)
        payload.set(new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength))
        sendAudio(payload.buffer)
      }

      source.connect(processor)
      processor.connect(zeroGain)
      zeroGain.connect(context.destination)

      streamRef.current = stream
      contextRef.current = context
      sourceRef.current = source
      processorRef.current = processor
      zeroGainRef.current = zeroGain

      send({ type: 'START_RECORDING', profile_id: selectedProfileId })
      setIsRecording(true)
      store.setAssistantState('LISTENING', 'Recording... tap to stop')
    },
    [
      extractTranscript,
      finalizeManualTranscript,
      getRecognitionCtor,
      queueWakeWordListening,
      resolveValidProfileId,
      resolveRecognitionLanguage,
      send,
      sendAudio,
      stopRecognitionSession,
    ],
  )

  const startWakeWordListening = useCallback(async () => {
    const RecognitionCtor = getRecognitionCtor()
    if (!RecognitionCtor || recognitionRef.current || isRecording) {
      return
    }

    const store = useAppStore.getState()
    const recognition = new RecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = resolveRecognitionLanguage(resolveValidProfileId(activeProfileIdRef.current))

    recognitionModeRef.current = 'wake'
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      const { finalTranscript, interimTranscript } = extractTranscript(event)

      if (recognitionModeRef.current === 'manual') {
        const combinedFinal = `${recognitionTranscriptRef.current} ${finalTranscript}`.trim()
        recognitionTranscriptRef.current = combinedFinal
        interimTranscriptRef.current = interimTranscript
        store.setLiveTranscription(
          `${recognitionTranscriptRef.current} ${interimTranscriptRef.current}`.trim(),
        )
        return
      }

      const match = findWakeMatch(`${finalTranscript} ${interimTranscript}`.trim())
      if (!match) {
        return
      }

      const selectedProfileId = match.profileId ?? resolveValidProfileId(activeProfileIdRef.current)

      if (selectedProfileId) {
        useAppStore.getState().setActiveProfileId(selectedProfileId)
      }

      recognitionModeRef.current = 'manual'
      manualProfileIdRef.current = selectedProfileId
      recognitionTranscriptRef.current = match.remainder.trim()
      interimTranscriptRef.current = ''
      manualStopRequestedRef.current = false
      setIsRecording(true)
      store.setLiveTranscription(recognitionTranscriptRef.current)
      store.setAssistantState('LISTENING', 'Recording... tap to stop')
    }

    recognition.onerror = (event) => {
      console.debug('Wake word listening failed', event.error)
      recognitionRef.current = null
      const previousMode = recognitionModeRef.current
      recognitionModeRef.current = 'idle'

      if (previousMode === 'manual' && manualStopRequestedRef.current) {
        finalizeManualTranscript()
        return
      }

      if (previousMode === 'manual') {
        setIsRecording(false)
        store.setLiveTranscription('')
        store.setAssistantState('ERROR', `Speech recognition failed: ${event.error}`)
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        useAppStore.getState().setAssistantState('IDLE', 'Tap to speak')
        return
      }
      queueWakeWordListening()
    }

    recognition.onend = () => {
      recognitionRef.current = null
      const previousMode = recognitionModeRef.current
      if (previousMode === 'manual') {
        if (manualStopRequestedRef.current) {
          recognitionModeRef.current = 'idle'
          finalizeManualTranscript()
          return
        }

        window.setTimeout(() => {
          void startManualRecognition(manualProfileIdRef.current, recognitionTranscriptRef.current)
        }, 150)
        return
      }

      if (previousMode === 'wake') {
        recognitionModeRef.current = 'idle'
        queueWakeWordListening()
      }
    }

    try {
      recognition.start()
      setIdleStatus()
    } catch (error) {
      console.debug('Wake word start failed', error)
      recognitionRef.current = null
      recognitionModeRef.current = 'idle'
    }
  }, [
    extractTranscript,
    finalizeManualTranscript,
    findWakeMatch,
    getRecognitionCtor,
    isRecording,
    queueWakeWordListening,
    resolveValidProfileId,
    resolveRecognitionLanguage,
    setIdleStatus,
    startManualRecognition,
  ])

  const startRecording = useCallback(
    async (profileId: string | null) => {
      if (isRecording) {
        return
      }

      try {
        await startManualRecognition(profileId)
      } catch (error) {
        console.error('Microphone access failed', error)

        const message =
          error instanceof DOMException
            ? error.name === 'NotAllowedError'
              ? 'Microphone access was blocked. Please allow microphone access for this tab and try again.'
              : error.name === 'NotFoundError'
                ? 'No microphone was found on this device.'
                : error.name === 'NotReadableError'
                  ? 'Your microphone is busy or unavailable. Close other apps using it and try again.'
                  : error.name === 'OverconstrainedError'
                    ? 'Your browser could not start the microphone with the requested audio settings.'
                    : `Microphone error: ${error.message || error.name}`
            : error instanceof Error
              ? error.message
              : 'Microphone access failed.'

        alert(message)
      }
    },
    [isRecording, startManualRecognition],
  )

  const stopRecording = useCallback(() => {
    if (recognitionModeRef.current === 'manual') {
      stopRecognitionSession(true)
      return
    }

    if (processorRef.current || streamRef.current) {
      stopRawRecording()
      send({ type: 'END_OF_SPEECH' })
      setIsRecording(false)
      useAppStore.getState().setAssistantState('THINKING', 'EVA is thinking...')
    }
  }, [send, stopRawRecording, stopRecognitionSession])

  useEffect(() => {
    const nextActiveProfileId =
      activeProfileId && profiles.some((profile) => profile.id === activeProfileId)
        ? activeProfileId
        : profiles[0]?.id ?? null

    if (nextActiveProfileId !== activeProfileId) {
      useAppStore.getState().setActiveProfileId(nextActiveProfileId)
    }
  }, [activeProfileId, profiles])

  useEffect(() => {
    if (isRecording) {
      return
    }

    if (assistantState === 'IDLE' || assistantState === 'ERROR') {
      if (recognitionModeRef.current === 'idle') {
        void startWakeWordListening()
      }
      return
    }

    if (assistantState === 'THINKING' || assistantState === 'SPEAKING') {
      if (recognitionModeRef.current === 'wake') {
        const current = recognitionRef.current
        recognitionRef.current = null
        recognitionModeRef.current = 'idle'
        try {
          current?.stop()
        } catch (error) {
          console.debug('Wake recognition shutdown failed', error)
        }
      }
    }
  }, [assistantState, isRecording, startWakeWordListening])

  useEffect(() => {
    return () => {
      clearWakeRestart()
      clearManualFinalizeTimer()
      stopRawRecording()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (error) {
          console.debug('Recognition cleanup failed', error)
        }
      }
    }
  }, [clearManualFinalizeTimer, clearWakeRestart, stopRawRecording])

  return {
    isRecording,
    startRecording,
    stopRecording,
  }
}

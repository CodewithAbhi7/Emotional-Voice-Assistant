import { useEffect } from 'react'

import { useAppStore } from '../store/useAppStore'
import type { AlarmEvent, EmotionResult, ServerMessage } from '../store/types'
import { playAudioBase64 } from '../lib/audio'
import { websocketClient } from '../lib/websocket'

let storeBound = false
let speechFallbackTimer: number | null = null
let pendingSpeechText = ''
let browserSpeechActive = false

function clearSpeechFallback() {
  if (speechFallbackTimer !== null) {
    window.clearTimeout(speechFallbackTimer)
    speechFallbackTimer = null
  }
  pendingSpeechText = ''
}

function speakWithBrowserVoice(text: string) {
  if (!('speechSynthesis' in window) || !text.trim()) {
    return false
  }

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1
  utterance.pitch = 1
  browserSpeechActive = true
  useAppStore.getState().setAssistantState('SPEAKING', 'EVA is speaking...')
  utterance.onend = () => {
    browserSpeechActive = false
    useAppStore.getState().setAssistantState('IDLE', 'Tap to speak')
  }
  utterance.onerror = () => {
    browserSpeechActive = false
    useAppStore.getState().setAssistantState('ERROR', 'Voice playback failed')
  }
  window.speechSynthesis.speak(utterance)
  return true
}

function scheduleSpeechFallback(text: string) {
  clearSpeechFallback()
  pendingSpeechText = text
  speechFallbackTimer = window.setTimeout(() => {
    if (!pendingSpeechText) {
      return
    }
    speakWithBrowserVoice(pendingSpeechText)
    clearSpeechFallback()
  }, 15000)
}

function bindStore() {
  if (storeBound) {
    return
  }

  websocketClient.subscribeStatus((connected) => {
    useAppStore.getState().setWsConnected(connected)
  })

  websocketClient.subscribe(async (message) => {
    const store = useAppStore.getState()
    const typed = message as ServerMessage
    const useDefaultAssistantVoice = store.mode === 'PROFESSIONAL'
    const hasActiveVoiceProfile =
      Boolean(store.activeProfileId) &&
      store.profiles.some((profile) => profile.id === store.activeProfileId)

    switch (typed.type) {
      case 'STATUS':
        if (!(browserSpeechActive && typed.state === 'IDLE')) {
          store.setAssistantState(typed.state, typed.message)
        }
        break
      case 'TRANSCRIPTION':
        if (typed.is_final) {
          store.addMessage({ role: 'user', text: typed.text })
          store.setLiveTranscription('')
        } else {
          store.setLiveTranscription(typed.text)
        }
        break
      case 'EMOTION':
        store.setEmotion({
          state: typed.state,
          confidence: typed.confidence,
          scores: typed.scores,
        } as EmotionResult)
        break
      case 'RESPONSE_TEXT':
        if (typed.is_final) {
          store.addMessage({
            role: 'assistant',
            text: typed.text,
            emotion: store.currentEmotion?.state,
          })
          store.setLiveResponse('')
          pendingSpeechText = typed.text
          if (useDefaultAssistantVoice) {
            clearSpeechFallback()
            if (!speakWithBrowserVoice(typed.text)) {
              store.setAssistantState('IDLE', 'Tap to speak')
            }
          } else if (!hasActiveVoiceProfile) {
            scheduleSpeechFallback(typed.text)
          } else {
            clearSpeechFallback()
            pendingSpeechText = typed.text
          }
        } else {
          store.appendLiveResponse(typed.text)
        }
        break
      case 'RESPONSE_AUDIO':
        {
          const fallbackText = pendingSpeechText
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel()
          }
          browserSpeechActive = false
          clearSpeechFallback()
          store.setAssistantState('SPEAKING', 'EVA is speaking...')
          try {
            await playAudioBase64(typed.audio_b64)
          } catch (error) {
            console.error('Audio playback failed', error)
            speakWithBrowserVoice(fallbackText)
          }
          store.setAssistantState('IDLE', 'Tap to speak')
        }
        break
      case 'MODE_CHANGED':
        store.setMode(typed.mode)
        break
      case 'ALARM_FIRED':
        store.setActiveAlarm(typed as AlarmEvent)
        if (typed.audio_b64) {
          try {
            await playAudioBase64(typed.audio_b64)
          } catch (error) {
            console.error('Alarm audio playback failed', error)
          }
        }
        break
      case 'CRISIS_ALERT':
        store.setCrisisAlert({
          risk_level: typed.risk_level,
          helpline: typed.helpline,
        })
        break
      case 'ERROR':
        console.error('Server error', typed.code, typed.message)
        if (
          pendingSpeechText &&
          !useDefaultAssistantVoice &&
          hasActiveVoiceProfile &&
          (typed.code === 'TEXT_FAILED' || typed.code === 'PROCESSING_FAILED')
        ) {
          speakWithBrowserVoice(pendingSpeechText)
          clearSpeechFallback()
        }
        store.setAssistantState('ERROR', typed.message)
        break
      case 'PONG':
      case 'ping':
        break
      default:
        break
    }
  })

  storeBound = true
}

export function useWebSocket() {
  const connected = useAppStore((state) => state.wsConnected)

  useEffect(() => {
    bindStore()
    websocketClient.connect()
  }, [])

  return {
    connected,
    send: websocketClient.sendJson.bind(websocketClient),
    sendAudio: websocketClient.sendBinary.bind(websocketClient),
  }
}

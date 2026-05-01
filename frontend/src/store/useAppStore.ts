import { create } from 'zustand'

import type {
  Alarm,
  AlarmEvent,
  AssistantState,
  EmotionResult,
  Message,
  Mode,
  Phrase,
  VoiceProfile,
} from './types'

interface CrisisAlertState {
  risk_level: string
  helpline: string
}

interface AppState {
  profiles: VoiceProfile[]
  activeProfileId: string | null
  setProfiles: (profiles: VoiceProfile[]) => void
  setActiveProfileId: (id: string | null) => void

  mode: Mode
  setMode: (mode: Mode) => void

  assistantState: AssistantState
  statusMessage: string
  setAssistantState: (state: AssistantState, message?: string) => void

  currentEmotion: EmotionResult | null
  setEmotion: (emotion: EmotionResult | null) => void

  messages: Message[]
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  clearMessages: () => void

  liveTranscription: string
  setLiveTranscription: (text: string) => void

  liveResponse: string
  setLiveResponse: (text: string) => void
  appendLiveResponse: (text: string) => void

  alarms: Alarm[]
  setAlarms: (alarms: Alarm[]) => void

  phrases: Phrase[]
  setPhrases: (phrases: Phrase[]) => void

  activeAlarm: AlarmEvent | null
  setActiveAlarm: (alarm: AlarmEvent | null) => void

  crisisAlert: CrisisAlertState | null
  setCrisisAlert: (crisis: CrisisAlertState | null) => void

  isSetupComplete: boolean
  setSetupComplete: (value: boolean) => void

  wsConnected: boolean
  setWsConnected: (value: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  setProfiles: (profiles) =>
    set((state) => {
      const existingActive = profiles.find(
        (profile) => profile.id === state.activeProfileId,
      )
      return {
        profiles,
        activeProfileId: existingActive?.id ?? profiles[0]?.id ?? null,
      }
    }),
  setActiveProfileId: (id) => set({ activeProfileId: id }),

  mode: 'PERSONAL',
  setMode: (mode) => set({ mode }),

  assistantState: 'IDLE',
  statusMessage: 'Tap to speak',
  setAssistantState: (state, message) =>
    set({
      assistantState: state,
      statusMessage: message ?? 'Tap to speak',
    }),

  currentEmotion: null,
  setEmotion: (emotion) => set({ currentEmotion: emotion }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [] }),

  liveTranscription: '',
  setLiveTranscription: (text) => set({ liveTranscription: text }),

  liveResponse: '',
  setLiveResponse: (text) => set({ liveResponse: text }),
  appendLiveResponse: (text) =>
    set((state) => ({ liveResponse: `${state.liveResponse}${text}` })),

  alarms: [],
  setAlarms: (alarms) => set({ alarms }),

  phrases: [],
  setPhrases: (phrases) => set({ phrases }),

  activeAlarm: null,
  setActiveAlarm: (alarm) => set({ activeAlarm: alarm }),

  crisisAlert: null,
  setCrisisAlert: (crisis) => set({ crisisAlert: crisis }),

  isSetupComplete: false,
  setSetupComplete: (value) => set({ isSetupComplete: value }),

  wsConnected: false,
  setWsConnected: (value) => set({ wsConnected: value }),
}))

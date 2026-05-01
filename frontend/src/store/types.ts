export type Mode = 'PERSONAL' | 'PROFESSIONAL'

export type EmotionState =
  | 'CALM'
  | 'STRESSED'
  | 'ANXIOUS'
  | 'SAD'
  | 'HAPPY'
  | 'ANGRY'
  | 'TIRED'
  | 'GRIEF'

export type AssistantState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'ERROR'

export type RelationshipType =
  | 'MOM'
  | 'DAD'
  | 'SIBLING'
  | 'MENTOR'
  | 'FRIEND'
  | 'CUSTOM'

export type AlarmPhase = 0 | 1 | 2 | 3 | 4

export interface VoiceProfile {
  id: string
  relationship: RelationshipType
  display_name: string
  language: string
  quality: number
  created_at: string
  is_default?: number
}

export interface Alarm {
  id: string
  profile_id: string
  label: string
  alarm_time: string
  days: string
  is_active: boolean
  primary_phrase: string | null
  escalation_phrase_1: string | null
  escalation_phrase_2: string | null
  escalation_phrase_3: string | null
  auto_generate: boolean
  language: string
  snooze_minutes?: number
  escalation_trigger_snooze?: number
}

export interface Phrase {
  id: string
  profile_id: string
  phrase_type: string
  text: string
  language: string
  warmth: number
  urgency: number
  anger: number
  audio_cache?: string | null
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  emotion?: EmotionState
  timestamp: Date
}

export interface EmotionResult {
  state: EmotionState
  confidence: number
  scores: Record<string, number>
}

export interface AlarmEvent {
  alarm_id: string
  phase: AlarmPhase
  phrase: string
  audio_b64: string | null
}

export type ServerMessage =
  | { type: 'TRANSCRIPTION'; text: string; is_final: boolean }
  | { type: 'EMOTION'; state: EmotionState; confidence: number; scores: Record<string, number> }
  | { type: 'RESPONSE_TEXT'; text: string; is_final: boolean }
  | { type: 'RESPONSE_AUDIO'; audio_b64: string; duration_ms: number }
  | { type: 'MODE_CHANGED'; mode: Mode; reason: string }
  | { type: 'ALARM_FIRED'; alarm_id: string; phase: number; phrase: string; audio_b64: string | null }
  | { type: 'CRISIS_ALERT'; risk_level: 'HIGH' | 'MEDIUM'; helpline: string }
  | { type: 'STATUS'; state: AssistantState; message: string }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG' }
  | { type: 'ping' }

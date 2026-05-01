import type { RelationshipType } from '../store/types'

const browserHost =
  typeof window !== 'undefined' ? window.location.hostname : 'localhost'

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? `http://${browserHost}:8000/api`

export const WS_URL =
  import.meta.env.VITE_WS_URL ?? `ws://${browserHost}:8000/ws`

export const RELATIONSHIP_OPTIONS: RelationshipType[] = [
  'MOM',
  'DAD',
  'SIBLING',
  'MENTOR',
  'FRIEND',
  'CUSTOM',
]

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'bn', label: 'Bengali' },
]

export const ALARM_DAY_OPTIONS = [
  { value: 'ONCE', label: 'Once' },
  { value: 'MON,TUE,WED,THU,FRI', label: 'Weekdays' },
  { value: 'MON,TUE,WED,THU,FRI,SAT,SUN', label: 'Every day' },
  { value: 'SAT,SUN', label: 'Weekends' },
]

export const PHRASE_TYPES = [
  { value: 'ALARM_WAKEUP', label: 'Alarm - Gentle Wake-up', urgency: 0.2, warmth: 0.9 },
  { value: 'ALARM_ESCALATION_1', label: 'Alarm - Phase 1', urgency: 0.45, warmth: 0.85 },
  { value: 'ALARM_ESCALATION_2', label: 'Alarm - Phase 2', urgency: 0.7, warmth: 0.65 },
  { value: 'ALARM_ESCALATION_3', label: 'Alarm - Phase 3', urgency: 0.9, warmth: 0.4 },
  { value: 'GOOD_MORNING', label: 'Good Morning', urgency: 0.2, warmth: 0.9 },
  { value: 'MOTIVATION', label: 'Motivational', urgency: 0.3, warmth: 0.8 },
  { value: 'STRESS_RESPONSE', label: 'Stress Support', urgency: 0.1, warmth: 1.0 },
  { value: 'PRAISE', label: 'Praise', urgency: 0.3, warmth: 0.9 },
  { value: 'GOOD_NIGHT', label: 'Good Night', urgency: 0.1, warmth: 0.9 },
]

"""
Alarm escalation state machine.
"""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Awaitable, Callable, Optional

from loguru import logger

from app.config import Config


@dataclass
class AlarmState:
    alarm_id: str
    phase: int = 0
    snooze_count: int = 0
    is_active: bool = True
    started_at: datetime = field(default_factory=datetime.now)
    timer_task: Optional[asyncio.Task] = None


class EscalationEngine:
    def __init__(
        self,
        voice_cloner,
        db,
        llm_fn: Callable[[str], Awaitable[str]],
    ):
        self.cloner = voice_cloner
        self.db = db
        self.llm_fn = llm_fn
        self._states: dict[str, AlarmState] = {}
        self._callbacks: dict[str, Callable] = {}

    def on_alarm_event(self, alarm_id: str, callback: Callable):
        self._callbacks[alarm_id] = callback

    async def start(self, alarm: dict):
        alarm_id = alarm["id"]
        state = AlarmState(alarm_id=alarm_id)
        self._states[alarm_id] = state
        logger.info("Alarm starting: {}", alarm_id)
        await self._play(alarm, state)

    async def on_response(self, alarm_id: str, action: str):
        state = self._states.get(alarm_id)
        if not state or not state.is_active:
            return

        if state.timer_task and not state.timer_task.done():
            state.timer_task.cancel()

        if action in {"DISMISS", "VERBAL_DISMISS"}:
            state.is_active = False
            self._states.pop(alarm_id, None)
            return

        if action in {"SNOOZE", "VERBAL_SNOOZE"}:
            state.snooze_count += 1
            alarm = await self.db.get_alarm_with_profile(alarm_id)
            trigger = alarm.get("escalation_trigger_snooze", Config.ALARM_ESCALATION_TRIGGER)
            if state.snooze_count >= trigger:
                state.phase = min(state.phase + 1, 3)

            delay = alarm.get("snooze_minutes", Config.ALARM_SNOOZE_MINUTES) * 60
            state.timer_task = asyncio.create_task(
                self._delayed_replay(alarm_id, alarm, state, delay)
            )

    async def _play(self, alarm: dict, state: AlarmState):
        phase = state.phase
        tone = Config.ALARM_TONE_PHASES[phase].copy()
        phrase = await self._resolve_phrase(alarm, phase)
        cache_key = f"{alarm['id']}_phase_{phase}"

        audio_path = None
        try:
            audio_path = await self.cloner.synthesize_cached(
                text=phrase,
                speaker_wav=alarm["speaker_wav"],
                language=alarm.get("language", "en"),
                tone=tone,
                cache_key=cache_key,
            )
        except Exception as exc:
            logger.warning("Alarm synthesis failed: {}", exc)

        callback = self._callbacks.get(alarm["id"])
        if callback:
            await callback(alarm["id"], audio_path, phase, phrase)

        if phase < 3 and state.is_active:
            delay = self._phase_delay_seconds()
            state.timer_task = asyncio.create_task(
                self._escalation_timer(alarm, state, delay)
            )

    async def _escalation_timer(self, alarm: dict, state: AlarmState, delay: float):
        try:
            await asyncio.sleep(delay)
            if not state.is_active:
                return
            state.snooze_count += 1
            state.phase = min(state.phase + 1, 3)
            if state.phase <= 3:
                await self._play(alarm, state)
            else:
                await self._fallback(alarm["id"])
        except asyncio.CancelledError:
            pass

    def _phase_delay_seconds(self) -> int:
        minimum = max(1, int(Config.ALARM_PHASE_DELAY_MIN_SECONDS))
        maximum = max(minimum, int(Config.ALARM_PHASE_DELAY_MAX_SECONDS))
        return random.randint(minimum, maximum)

    async def _delayed_replay(self, alarm_id: str, alarm: dict, state: AlarmState, delay: float):
        try:
            await asyncio.sleep(delay)
            if state.is_active:
                await self._play(alarm, state)
        except asyncio.CancelledError:
            pass

    async def _fallback(self, alarm_id: str):
        state = self._states.get(alarm_id)
        if state:
            state.is_active = False
            self._states.pop(alarm_id, None)

        callback = self._callbacks.get(alarm_id)
        if callback:
            await callback(alarm_id, None, 4, "SYSTEM_ALARM_FALLBACK")

    async def _resolve_phrase(self, alarm: dict, phase: int) -> str:
        if phase == 0:
            phrase = (alarm.get("primary_phrase") or "").strip()
            if phrase:
                return phrase

            if alarm.get("auto_generate", True):
                return await self._llm_generate(alarm, phase)

            return self._default(alarm, 0)

        phrase_key = f"escalation_phrase_{phase}"
        saved_phrase = (alarm.get(phrase_key) or "").strip()
        if saved_phrase:
            return saved_phrase

        if alarm.get("auto_generate", True):
            return await self._llm_generate(alarm, phase)

        return self._default(alarm, phase)

    async def _llm_generate(self, alarm: dict, phase: int) -> str:
        from app.gemini.prompts import ESCALATION_PHRASE_PROMPT

        phase_descriptions = [
            "gentle, caring, and appropriate for the reminder type",
            "concerned, firmer, and appropriate for the reminder type",
            "clearly firm, urgent, and appropriate for the reminder type",
            "strongly insistent, emotionally intense, but still caring",
        ]
        intent = self._infer_alarm_intent(alarm)
        prompt = ESCALATION_PHRASE_PROMPT.format(
            relationship_type=alarm.get("relationship_type", "MOM"),
            label=alarm.get("label", "Alarm"),
            intent=intent.replace("_", " "),
            intent_description=self._intent_description(intent),
            primary_phrase=alarm.get("primary_phrase", ""),
            time_hint=alarm.get("alarm_time", ""),
            language=alarm.get("language", "en"),
            phase=phase,
            phase_description=phase_descriptions[phase],
        )
        try:
            result = await self.llm_fn(prompt)
            cleaned = result.strip().strip("\"'")
            return cleaned[:100] or self._default(alarm, phase)
        except Exception as exc:
            logger.warning("LLM escalation phrase generation failed: {}", exc)
            return self._default(alarm, phase)

    def _infer_alarm_intent(self, alarm: dict) -> str:
        haystack = " ".join(
            str(alarm.get(key, "") or "")
            for key in (
                "label",
                "primary_phrase",
                "escalation_phrase_1",
                "escalation_phrase_2",
                "escalation_phrase_3",
            )
        ).lower()

        keyword_map = [
            ("sleep", ["sleep", "bed", "bedtime", "night", "lights out", "wind down", "rest"]),
            ("hydrate", ["water", "hydrate", "hydration", "drink water", "drink"]),
            ("medicine", ["medicine", "meds", "tablet", "pill", "vitamin", "syrup"]),
            ("study", ["study", "homework", "revision", "revise", "assignment", "exam"]),
            ("meeting", ["meeting", "call", "class", "interview", "appointment", "doctor"]),
            ("workout", ["workout", "gym", "exercise", "run", "yoga", "walk"]),
            ("meal", ["breakfast", "lunch", "dinner", "meal", "eat", "food"]),
            ("wake", ["wake", "wake up", "morning", "get up", "school", "office"]),
        ]

        for intent, keywords in keyword_map:
            if any(keyword in haystack for keyword in keywords):
                return intent

        hour = None
        raw_time = str(alarm.get("alarm_time", "") or "")
        try:
            if "T" in raw_time:
                hour = int(raw_time.split("T", 1)[1].split(":", 1)[0])
            elif ":" in raw_time:
                hour = int(raw_time.split(":", 1)[0])
        except Exception:
            hour = None

        if hour is not None:
            if 20 <= hour <= 23 or 0 <= hour <= 2:
                return "sleep"
            if 4 <= hour <= 11:
                return "wake"

        return "reminder"

    def _intent_description(self, intent: str) -> str:
        descriptions = {
            "wake": "wake the user up and get them moving",
            "sleep": "gently but clearly tell the user it is time to sleep or go to bed",
            "hydrate": "remind the user to drink water or stay hydrated",
            "medicine": "remind the user to take their medicine or vitamins",
            "study": "remind the user to study, revise, or focus on schoolwork",
            "meeting": "remind the user to join or prepare for a meeting, class, or appointment",
            "workout": "remind the user to start a workout, exercise, or walk",
            "meal": "remind the user to eat a meal or not skip food",
            "reminder": "give a general reminder that matches the alarm label and time",
        }
        return descriptions[intent]

    def _default(self, alarm: dict, phase: int) -> str:
        relationship = alarm.get("relationship_type", "MOM")
        intent = self._infer_alarm_intent(alarm)

        intent_defaults = {
            "sleep": [
                "Beta, it is bedtime now, time to sleep.",
                "Come on, put the phone away and get into bed.",
                "No more delaying now, go to sleep properly.",
                "Enough now. Get in bed and sleep.",
            ],
            "hydrate": [
                "Beta, drink some water now.",
                "Come on, have your water, do not skip it.",
                "Drink water now, you keep putting it off.",
                "Right now, get up and drink water.",
            ],
            "medicine": [
                "Beta, it is time to take your medicine.",
                "Please take your medicine now, do not miss it.",
                "Take it now, this should not be delayed.",
                "Right now, take your medicine immediately.",
            ],
            "study": [
                "Beta, it is time to study now.",
                "Come on, sit down and start studying.",
                "No more delay, focus and get to work.",
                "Enough stalling, start studying right now.",
            ],
            "meeting": [
                "Beta, it is time for your meeting.",
                "Come on, get ready, you need to join now.",
                "You need to move now or you will be late.",
                "Right now, join it. No more delay.",
            ],
            "workout": [
                "Beta, it is time for your workout.",
                "Come on, get moving and start exercising.",
                "No excuses now, get up and work out.",
                "Right now, start your workout.",
            ],
            "meal": [
                "Beta, it is time to eat now.",
                "Come on, do not skip your meal.",
                "Eat now, you should not keep delaying it.",
                "Right now, go and eat properly.",
            ],
            "reminder": [
                "Beta, this is your reminder.",
                "Come on, do it now, do not put it off.",
                "You need to handle this now.",
                "Right now, do it. No more delay.",
            ],
        }

        if intent in intent_defaults:
            phrases = intent_defaults[intent]
            return phrases[min(phase, len(phrases) - 1)]

        defaults = {
            "MOM": [
                "Good morning sweetheart, time to wake up...",
                "Come on beta, please wake up, it is getting late!",
                "Wake up now! You are going to miss everything!",
                "GET UP RIGHT NOW! I MEAN IT!",
            ],
            "DAD": [
                "Rise and shine, time to get moving.",
                "Come on, get up, let us go.",
                "Wake up. Now. This is serious.",
                "GET UP. NOW. NO MORE EXCUSES.",
            ],
            "SIBLING": [
                "Hey, wake up sleepyhead...",
                "Yo! You are going to be so late, get up!",
                "I WILL POUR WATER ON YOU, WAKE UP!",
                "THAT IS IT. I AM COMING IN THERE.",
            ],
            "MENTOR": [
                "Good morning. Time to start.",
                "Wake up. Success does not wait.",
                "This is unacceptable. Get up now.",
                "GET UP. YOU ARE WASTING YOUR POTENTIAL.",
            ],
            "FRIEND": [
                "Heyyyy wake up!",
                "Dude seriously, get up, you will be late!",
                "I AM CALLING YOU. PICK UP. WAKE UP!",
                "I GIVE UP. JUST WAKE UP PLEASE!!",
            ],
        }
        phrases = defaults.get(relationship, defaults["MOM"])
        return phrases[min(phase, len(phrases) - 1)]

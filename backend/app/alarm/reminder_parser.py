"""
Local reminder-command parser for creating alarms from chat.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any


RELATIONSHIP_ALIASES: dict[str, list[str]] = {
    "MOM": ["mom", "mother", "mummy", "mum", "maa", "amma"],
    "DAD": ["dad", "father", "papa", "appa", "abba"],
    "SIBLING": ["brother", "sister", "bro", "sis", "bhai", "didi"],
    "MENTOR": ["mentor", "coach", "teacher", "sir", "maam"],
    "FRIEND": ["friend", "buddy", "yaar"],
}

DAYPART_TIMES: dict[str, tuple[int, int]] = {
    "morning": (9, 0),
    "afternoon": (14, 0),
    "evening": (18, 0),
    "night": (21, 0),
    "bedtime": (22, 0),
    "noon": (12, 0),
}


@dataclass
class ReminderPlan:
    payload: dict[str, Any]
    confirmation: str


class ReminderParser:
    def __init__(self, db):
        self.db = db

    async def parse(
        self,
        text: str,
        preferred_profile_id: str | None = None,
    ) -> ReminderPlan | None:
        normalized = self._normalize(text)
        profiles = await self.db.list_profiles()

        reminder_like = self._looks_like_reminder_request(normalized)
        requested_profile = self._find_requested_profile(normalized, profiles)
        requested_role = self._find_requested_role(normalized)

        if not reminder_like:
            return None

        if requested_role and requested_profile is None:
            raise ValueError(
                f"I heard a {requested_role.lower()} reminder request, but no saved {requested_role.lower()} voice profile exists yet."
            )

        profile = requested_profile or self._fallback_profile(profiles, preferred_profile_id)
        if not profile:
            raise ValueError("Create a voice profile first so I can schedule reminders in that voice.")

        schedule = self._extract_schedule(normalized)
        if not schedule:
            raise ValueError(
                "Tell me when to remind you, for example 'at 9 am', 'tomorrow morning', or 'every 30 minutes'."
            )

        task = self._extract_task(normalized, profile, schedule["matched_phrases"])
        if not task:
            raise ValueError("Tell me what I should remind you about.")

        phrases = self._build_phrases(task)
        payload = {
            "profile_id": profile["id"],
            "alarm_time": schedule["alarm_time"],
            "days": schedule["days"],
            "label": self._build_label(task),
            "primary_phrase": phrases[0],
            "escalation_phrase_1": phrases[1],
            "escalation_phrase_2": phrases[2],
            "escalation_phrase_3": phrases[3],
            "auto_generate": False,
            "language": profile.get("language", "en"),
            "snooze_minutes": 1,
            "escalation_trigger_snooze": 2,
        }
        confirmation = self._build_confirmation(task, schedule["summary"], profile)
        return ReminderPlan(payload=payload, confirmation=confirmation)

    def _normalize(self, text: str) -> str:
        lowered = text.lower()
        lowered = lowered.replace("half an hour", "30 minutes")
        lowered = lowered.replace("half hour", "30 minutes")
        lowered = re.sub(r"[?!.]+", " ", lowered)
        lowered = re.sub(r"\s+", " ", lowered)
        return lowered.strip()

    def _looks_like_reminder_request(self, text: str) -> bool:
        explicit_markers = [
            "remind",
            "reminder",
            "set alarm",
            "set an alarm",
            "set a reminder",
            "create alarm",
            "create an alarm",
            "make alarm",
            "make an alarm",
            "alarm for",
            "don't let me forget",
            "do not let me forget",
            "remember to",
            "wake me",
        ]
        if any(marker in text for marker in explicit_markers):
            return True

        has_time = bool(self._extract_schedule(text))
        imperative_hint = text.startswith(("mom ", "dad ", "maa ", "papa ", "mummy ", "father "))
        polite_hint = (
            "please" in text
            or text.startswith("please ")
            or text.startswith("can you ")
            or text.startswith("could you ")
            or text.startswith("will you ")
        )
        return has_time and (imperative_hint or polite_hint)

    def _find_requested_role(self, text: str) -> str | None:
        for relationship, aliases in RELATIONSHIP_ALIASES.items():
            if any(re.search(rf"\b{re.escape(alias)}\b", text) for alias in aliases):
                return relationship
        return None

    def _find_requested_profile(
        self,
        text: str,
        profiles: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        for profile in profiles:
            aliases = self._profile_aliases(profile)
            if any(alias and re.search(rf"\b{re.escape(alias)}\b", text) for alias in aliases):
                return profile

        requested_role = self._find_requested_role(text)
        if not requested_role:
            return None

        for profile in profiles:
            profile_aliases = self._profile_aliases(profile)
            if profile.get("relationship") == requested_role or any(
                alias in RELATIONSHIP_ALIASES.get(requested_role, [])
                for alias in profile_aliases
            ):
                return profile
        return None

    def _fallback_profile(
        self,
        profiles: list[dict[str, Any]],
        preferred_profile_id: str | None,
    ) -> dict[str, Any] | None:
        if preferred_profile_id:
            for profile in profiles:
                if profile["id"] == preferred_profile_id:
                    return profile
        return profiles[0] if profiles else None

    def _profile_aliases(self, profile: dict[str, Any]) -> list[str]:
        name = str(profile.get("display_name", "") or "").strip().lower()
        aliases = [name] if name else []
        relationship = str(profile.get("relationship", "") or "").upper()
        aliases.extend(RELATIONSHIP_ALIASES.get(relationship, []))

        for extra_aliases in RELATIONSHIP_ALIASES.values():
            if name and name in extra_aliases:
                aliases.extend(extra_aliases)

        return list(dict.fromkeys(alias for alias in aliases if alias))

    def _extract_schedule(self, text: str) -> dict[str, Any] | None:
        now = datetime.now()

        interval, interval_phrase = self._extract_interval_minutes(text)
        if interval:
            start_time, time_phrase = self._extract_specific_datetime(text, now)
            if start_time is None:
                start_time = self._next_interval_start(now, interval)
            summary = "every hour" if interval == 60 else f"every {interval} minutes"
            return {
                "alarm_time": start_time.isoformat(timespec="minutes"),
                "days": f"INTERVAL:{interval}",
                "summary": summary,
                "matched_phrases": [phrase for phrase in (interval_phrase, time_phrase) if phrase],
            }

        repeat_days, repeat_summary = self._extract_repeat_days(text)
        specific_dt, specific_phrase = self._extract_specific_datetime(text, now)

        if specific_dt:
            summary = repeat_summary or self._describe_datetime(specific_dt, now)
            days = repeat_days or "ONCE"
            return {
                "alarm_time": specific_dt.isoformat(timespec="minutes"),
                "days": days,
                "summary": summary,
                "matched_phrases": [phrase for phrase in (specific_phrase, repeat_summary) if phrase],
            }

        daypart_dt, daypart_summary, daypart_phrase = self._extract_daypart_datetime(
            text,
            now,
            recurring=bool(repeat_days),
        )
        if daypart_dt:
            summary = repeat_summary or daypart_summary
            days = repeat_days or "ONCE"
            return {
                "alarm_time": daypart_dt.isoformat(timespec="minutes"),
                "days": days,
                "summary": summary,
                "matched_phrases": [phrase for phrase in (daypart_phrase, repeat_summary) if phrase],
            }

        return None

    def _extract_interval_minutes(self, text: str) -> tuple[int | None, str | None]:
        minute_match = re.search(r"\bevery (\d+) (minute|minutes|min|mins)\b", text)
        if minute_match:
            return max(1, int(minute_match.group(1))), minute_match.group(0)

        hour_match = re.search(r"\bevery (\d+) (hour|hours)\b", text)
        if hour_match:
            return max(1, int(hour_match.group(1))) * 60, hour_match.group(0)

        if "every 30 minutes" in text:
            return 30, "every 30 minutes"
        if "hourly" in text or "every hour" in text:
            return 60, "hourly" if "hourly" in text else "every hour"
        return None, None

    def _extract_repeat_days(self, text: str) -> tuple[str | None, str | None]:
        if "weekdays" in text:
            return "MON,TUE,WED,THU,FRI", "on weekdays"
        if "weekends" in text:
            return "SAT,SUN", "on weekends"
        if "every day" in text or "daily" in text:
            return "MON,TUE,WED,THU,FRI,SAT,SUN", "every day"
        for daypart in ("morning", "afternoon", "evening", "night", "bedtime"):
            if f"every {daypart}" in text:
                return "MON,TUE,WED,THU,FRI,SAT,SUN", f"every {daypart}"
        return None, None

    def _extract_specific_datetime(self, text: str, now: datetime) -> tuple[datetime | None, str | None]:
        tomorrow = "tomorrow" in text

        match_12h = re.search(r"\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", text)
        if match_12h:
            hour = int(match_12h.group(1)) % 12
            minute = int(match_12h.group(2) or "0")
            meridiem = match_12h.group(3)
            if meridiem == "pm":
                hour += 12
            candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if tomorrow or candidate <= now:
                candidate += timedelta(days=1)
            return candidate, match_12h.group(0)

        match_24h = re.search(r"\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b", text)
        if match_24h:
            hour = int(match_24h.group(1))
            minute = int(match_24h.group(2))
            candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if tomorrow or candidate <= now:
                candidate += timedelta(days=1)
            return candidate, match_24h.group(0)

        compact_match = re.search(r"\b(?:at|around|about|by|near)\s+(\d{3,4})\b", text)
        if compact_match:
            candidate = self._resolve_compact_time(now, compact_match.group(1), tomorrow=tomorrow)
            if candidate:
                return candidate, compact_match.group(0)

        spaced_match = re.search(r"\b(?:at|around|about|by|near)\s+(\d{1,2})\s+(\d{2})\b", text)
        if spaced_match:
            candidate = self._resolve_hour_minute_candidates(
                now,
                int(spaced_match.group(1)),
                int(spaced_match.group(2)),
                tomorrow=tomorrow,
            )
            if candidate:
                return candidate, spaced_match.group(0)

        return None, None

    def _resolve_compact_time(
        self,
        now: datetime,
        compact_value: str,
        *,
        tomorrow: bool = False,
    ) -> datetime | None:
        if len(compact_value) not in (3, 4):
            return None

        hour = int(compact_value[:-2])
        minute = int(compact_value[-2:])
        return self._resolve_hour_minute_candidates(now, hour, minute, tomorrow=tomorrow)

    def _resolve_hour_minute_candidates(
        self,
        now: datetime,
        hour: int,
        minute: int,
        *,
        tomorrow: bool = False,
    ) -> datetime | None:
        if minute < 0 or minute > 59 or hour < 0 or hour > 23:
            return None

        candidate_hours = [hour]
        if 1 <= hour <= 11:
            candidate_hours.append(hour + 12)

        candidates: list[datetime] = []
        for candidate_hour in dict.fromkeys(candidate_hours):
            candidate = now.replace(hour=candidate_hour, minute=minute, second=0, microsecond=0)
            if tomorrow or candidate <= now:
                candidate += timedelta(days=1)
            candidates.append(candidate)

        return min(candidates) if candidates else None

    def _extract_daypart_datetime(
        self,
        text: str,
        now: datetime,
        recurring: bool = False,
    ) -> tuple[datetime | None, str | None, str | None]:
        tomorrow = "tomorrow" in text

        for daypart, (hour, minute) in DAYPART_TIMES.items():
            match = re.search(rf"\b(?:tomorrow )?{re.escape(daypart)}\b", text) or re.search(
                rf"\b(?:at|in the|this) {re.escape(daypart)}\b",
                text,
            )
            if match:
                candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if recurring:
                    summary = f"every {daypart}"
                    if candidate <= now:
                        candidate += timedelta(days=1)
                    return candidate, summary, match.group(0)

                if tomorrow or candidate <= now:
                    candidate += timedelta(days=1)
                summary = self._describe_daypart(candidate, daypart, now)
                return candidate, summary, match.group(0)

        return None, None, None

    def _next_interval_start(self, now: datetime, interval_minutes: int) -> datetime:
        truncated = now.replace(second=0, microsecond=0)
        minutes_since_midnight = truncated.hour * 60 + truncated.minute
        remainder = minutes_since_midnight % interval_minutes
        wait = interval_minutes if remainder == 0 else interval_minutes - remainder
        return truncated + timedelta(minutes=wait)

    def _extract_task(
        self,
        text: str,
        profile: dict[str, Any],
        matched_phrases: list[str],
    ) -> str:
        cleaned = text
        removable_aliases = [str(profile.get("display_name", "") or "").strip().lower()]
        removable_aliases.extend(RELATIONSHIP_ALIASES.get(profile.get("relationship", ""), []))
        for alias in removable_aliases:
            if alias:
                cleaned = re.sub(rf"^\s*{re.escape(alias)}\b[, ]*", "", cleaned, count=1)

        removal_patterns = [
            r"^\s*(hey|hi|hello)\b",
            r"\bcan you hear me\b",
            r"\b(can you|could you|will you)\b",
            r"\bplease\b",
            r"\bset (me )?(an )?alarm (for|to)?\b",
            r"\bset (me )?(a )?reminder (for|to)?\b",
            r"\bcreate (me )?(an )?alarm (for|to)?\b",
            r"\bmake (me )?(an )?alarm (for|to)?\b",
            r"\bremind me to\b",
            r"\bremind me\b",
            r"\bremind\b",
            r"\bremember to\b",
            r"\bdon't let me forget to\b",
            r"\bdo not let me forget to\b",
        ]
        for pattern in removal_patterns:
            cleaned = re.sub(pattern, " ", cleaned)

        for phrase in sorted(matched_phrases, key=len, reverse=True):
            if phrase:
                cleaned = cleaned.replace(phrase.lower(), " ")

        cleaned = re.sub(r"\b(tomorrow|today)\b", " ", cleaned)
        cleaned = re.sub(r"\bfor me\b", " ", cleaned)
        cleaned = re.sub(r"\b(to|that|about|for|at|in)\b\s*$", " ", cleaned)
        cleaned = re.sub(r"^\s*to\b", " ", cleaned)
        cleaned = re.sub(r"^\s*for\b", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,")
        return cleaned

    def _build_label(self, task: str) -> str:
        words = task.split()
        if not words:
            return "Reminder"
        label = " ".join(words[:6]).strip()
        return label[:1].upper() + label[1:]

    def _build_phrases(self, task: str) -> tuple[str, str, str, str]:
        action = task.strip().rstrip(".")
        action = re.sub(r"^\s*to\b\s*", "", action)
        return (
            f"Beta, remember to {action} now.",
            f"Please do not forget to {action} now.",
            f"You need to {action} now.",
            f"Do {action} right now.",
        )

    def _build_confirmation(self, task: str, summary: str, profile: dict[str, Any]) -> str:
        voice_name = profile.get("display_name", "that")
        return f"Okay, I will remind you to {task} {summary} in {voice_name}'s voice."

    def _describe_datetime(self, target: datetime, now: datetime) -> str:
        if target.date() == now.date():
            return f"at {target.strftime('%I:%M %p').lstrip('0')}"
        if target.date() == (now + timedelta(days=1)).date():
            return f"tomorrow at {target.strftime('%I:%M %p').lstrip('0')}"
        return f"at {target.strftime('%I:%M %p').lstrip('0')} on {target.strftime('%d %b')}"

    def _describe_daypart(self, target: datetime, daypart: str, now: datetime) -> str:
        if target.date() == now.date():
            return f"this {daypart}"
        if target.date() == (now + timedelta(days=1)).date():
            return f"tomorrow {daypart}"
        return f"{daypart} on {target.strftime('%d %b')}"

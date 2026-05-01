"""
APScheduler-backed alarm orchestration.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable

from apscheduler.jobstores.base import JobLookupError
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from loguru import logger

from app.alarm.escalation import EscalationEngine
from app.config import Config
from app.database import DB


class AlarmEngine:
    def __init__(self, voice_cloner, mode_fsm):
        self.voice_cloner = voice_cloner
        self.mode_fsm = mode_fsm
        self.db = DB()
        self.scheduler = AsyncIOScheduler()
        self.listeners: dict[str, Callable] = {}
        self.escalation = EscalationEngine(
            voice_cloner=voice_cloner,
            db=self.db,
            llm_fn=self._generate_text,
        )

    async def start(self):
        self.scheduler.start()
        await self._restore_existing_alarms()

    async def stop(self):
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)

    def add_alarm_callback(self, listener_id: str, callback: Callable):
        self.listeners[listener_id] = callback

    def remove_alarm_callback(self, listener_id: str):
        self.listeners.pop(listener_id, None)

    async def schedule_alarm(self, alarm: dict):
        alarm_id = alarm["id"]
        job_id = self._job_id(alarm_id)
        try:
            self.scheduler.remove_job(job_id)
        except JobLookupError:
            pass

        days = (alarm.get("days") or "ONCE").upper()
        run_at = self._parse_alarm_time(alarm["alarm_time"])
        interval_minutes = self._parse_interval_minutes(days)

        if interval_minutes is not None:
            while run_at <= datetime.now():
                run_at += timedelta(minutes=interval_minutes)
            self.scheduler.add_job(
                self._fire_alarm,
                "interval",
                id=job_id,
                minutes=interval_minutes,
                start_date=run_at,
                kwargs={"alarm_id": alarm_id},
                replace_existing=True,
            )
        elif days == "ONCE":
            if run_at <= datetime.now():
                run_at += timedelta(days=1)
            self.scheduler.add_job(
                self._fire_alarm,
                "date",
                id=job_id,
                run_date=run_at,
                kwargs={"alarm_id": alarm_id},
                replace_existing=True,
            )
        else:
            day_of_week = ",".join(
                part.strip().lower()[:3]
                for part in days.split(",")
                if part.strip()
            )
            self.scheduler.add_job(
                self._fire_alarm,
                "cron",
                id=job_id,
                day_of_week=day_of_week,
                hour=run_at.hour,
                minute=run_at.minute,
                kwargs={"alarm_id": alarm_id},
                replace_existing=True,
            )

        logger.info("Scheduled alarm {}", alarm_id)

    async def unschedule_alarm(self, alarm_id: str):
        try:
            self.scheduler.remove_job(self._job_id(alarm_id))
        except JobLookupError:
            pass

    async def respond(self, alarm_id: str, action: str):
        await self.escalation.on_response(alarm_id, action)

    async def _restore_existing_alarms(self):
        alarms = await self.db.list_active_alarms()
        for alarm in alarms:
            try:
                await self.schedule_alarm(alarm)
            except Exception as exc:
                logger.warning("Could not restore alarm {}: {}", alarm["id"], exc)

    async def _fire_alarm(self, alarm_id: str):
        alarm = await self.db.get_alarm_with_profile(alarm_id)
        if not alarm:
            return

        await self.db.update_alarm_last_fired(alarm_id)
        self.escalation.on_alarm_event(alarm_id, self._dispatch_alarm_event)
        await self.escalation.start(alarm)

        if (alarm.get("days") or "ONCE").upper() == "ONCE":
            await self.unschedule_alarm(alarm_id)

    async def _dispatch_alarm_event(self, alarm_id: str, audio_path: str | None, phase: int, phrase: str):
        for listener_id, listener in list(self.listeners.items()):
            try:
                await listener(alarm_id, audio_path, phase, phrase)
            except Exception as exc:
                logger.debug("Alarm listener {} failed: {}", listener_id, exc)

    async def _generate_text(self, prompt: str) -> str:
        if not Config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        from google import genai

        client = genai.Client(api_key=Config.GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model=Config.GEMINI_FLASH_MODEL,
            contents=prompt,
        )
        return (response.text or "").strip()

    def _parse_alarm_time(self, value: str) -> datetime:
        try:
            if "T" in value or "-" in value:
                return datetime.fromisoformat(value)
        except ValueError:
            pass

        hours, minutes = value.split(":")
        now = datetime.now()
        return now.replace(hour=int(hours), minute=int(minutes), second=0, microsecond=0)

    def _parse_interval_minutes(self, days: str) -> int | None:
        if not days.startswith("INTERVAL:"):
            return None
        try:
            return max(1, int(days.split(":", 1)[1]))
        except Exception:
            return None

    def _job_id(self, alarm_id: str) -> str:
        return f"alarm:{alarm_id}"

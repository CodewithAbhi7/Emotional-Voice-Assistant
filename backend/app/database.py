"""
SQLite database layer for EVA.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

import aiosqlite
from loguru import logger

from app.config import Config

SQL_INIT = """
CREATE TABLE IF NOT EXISTS voice_profiles (
    id               TEXT PRIMARY KEY,
    relationship     TEXT NOT NULL CHECK(relationship IN
                     ('MOM','DAD','SIBLING','MENTOR','FRIEND','CUSTOM')),
    display_name     TEXT NOT NULL,
    language         TEXT NOT NULL DEFAULT 'en',
    sample_path      TEXT NOT NULL,
    speaker_wav      TEXT,
    quality          REAL DEFAULT 0.0,
    consent          INTEGER NOT NULL DEFAULT 0,
    is_default       INTEGER DEFAULT 0,
    created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alarms (
    id                          TEXT PRIMARY KEY,
    profile_id                  TEXT NOT NULL REFERENCES voice_profiles(id),
    label                       TEXT DEFAULT 'Alarm',
    alarm_time                  TEXT NOT NULL,
    days                        TEXT NOT NULL DEFAULT 'ONCE',
    is_active                   INTEGER DEFAULT 1,
    primary_phrase              TEXT,
    escalation_phrase_1         TEXT,
    escalation_phrase_2         TEXT,
    escalation_phrase_3         TEXT,
    auto_generate               INTEGER DEFAULT 1,
    language                    TEXT DEFAULT 'en',
    snooze_minutes              INTEGER DEFAULT 1,
    escalation_trigger_snooze   INTEGER DEFAULT 2,
    fallback_type               TEXT DEFAULT 'BEEP',
    created_at                  TEXT DEFAULT (datetime('now')),
    last_fired                  TEXT
);

CREATE TABLE IF NOT EXISTS phrases (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL REFERENCES voice_profiles(id),
    phrase_type  TEXT NOT NULL,
    text         TEXT NOT NULL,
    language     TEXT DEFAULT 'en',
    warmth       REAL DEFAULT 0.7,
    urgency      REAL DEFAULT 0.3,
    anger        REAL DEFAULT 0.0,
    audio_cache  TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT REFERENCES voice_profiles(id),
    mode         TEXT DEFAULT 'PERSONAL',
    started_at   TEXT DEFAULT (datetime('now')),
    ended_at     TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id            TEXT PRIMARY KEY,
    convo_id      TEXT NOT NULL REFERENCES conversations(id),
    role          TEXT NOT NULL CHECK(role IN ('user','assistant')),
    text          TEXT NOT NULL,
    emotion       TEXT,
    audio_path    TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


async def init_database():
    os.makedirs(os.path.dirname(Config.DB_PATH), exist_ok=True)
    async with aiosqlite.connect(Config.DB_PATH) as db:
        await db.executescript(SQL_INIT)
        await db.commit()
    logger.info("DB ready: {}", Config.DB_PATH)


class DB:
    @asynccontextmanager
    async def _connect(self):
        conn = await aiosqlite.connect(Config.DB_PATH)
        conn.row_factory = aiosqlite.Row
        try:
            yield conn
        finally:
            await conn.close()

    async def create_profile(self, data: dict[str, Any]) -> dict[str, Any]:
        async with self._connect() as conn:
            await conn.execute(
                "INSERT INTO voice_profiles (id,relationship,display_name,language,"
                "sample_path,speaker_wav,quality,consent,is_default)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    data["id"],
                    data["relationship"],
                    data["display_name"],
                    data["language"],
                    data["sample_path"],
                    data.get("speaker_wav"),
                    data.get("quality", 0.0),
                    1 if data.get("consent", True) else 0,
                    1 if data.get("is_default", False) else 0,
                ),
            )
            await conn.commit()
        return data

    async def set_default_profile(self, profile_id: str):
        async with self._connect() as conn:
            await conn.execute("UPDATE voice_profiles SET is_default=0")
            await conn.execute(
                "UPDATE voice_profiles SET is_default=1 WHERE id=?",
                (profile_id,),
            )
            await conn.commit()

    async def get_profile(self, profile_id: str) -> dict[str, Any] | None:
        async with self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM voice_profiles WHERE id=?",
                (profile_id,),
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_default_profile(self) -> dict[str, Any] | None:
        async with self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM voice_profiles"
                " ORDER BY is_default DESC, created_at ASC LIMIT 1"
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def list_profiles(self) -> list[dict[str, Any]]:
        async with self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM voice_profiles ORDER BY is_default DESC, created_at ASC"
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def delete_profile(self, profile_id: str):
        async with self._connect() as conn:
            await conn.execute("DELETE FROM voice_profiles WHERE id=?", (profile_id,))
            await conn.commit()

    async def list_alarms_for_profile(self, profile_id: str) -> list[dict[str, Any]]:
        async with self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM alarms WHERE profile_id=? ORDER BY created_at DESC",
                (profile_id,),
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def delete_profile_graph(self, profile_id: str):
        async with self._connect() as conn:
            async with conn.execute(
                "SELECT id FROM conversations WHERE profile_id=?",
                (profile_id,),
            ) as cur:
                conversation_rows = await cur.fetchall()

            conversation_ids = [row["id"] for row in conversation_rows]
            if conversation_ids:
                placeholders = ",".join("?" for _ in conversation_ids)
                await conn.execute(
                    f"DELETE FROM messages WHERE convo_id IN ({placeholders})",
                    tuple(conversation_ids),
                )

            await conn.execute("DELETE FROM conversations WHERE profile_id=?", (profile_id,))
            await conn.execute("DELETE FROM phrases WHERE profile_id=?", (profile_id,))
            await conn.execute("DELETE FROM alarms WHERE profile_id=?", (profile_id,))
            await conn.execute("DELETE FROM voice_profiles WHERE id=?", (profile_id,))
            await conn.commit()

    async def create_alarm(self, data: dict[str, Any]) -> dict[str, Any]:
        async with self._connect() as conn:
            await conn.execute(
                "INSERT INTO alarms (id,profile_id,label,alarm_time,days,is_active,"
                "primary_phrase,escalation_phrase_1,escalation_phrase_2,"
                "escalation_phrase_3,auto_generate,language,snooze_minutes,"
                "escalation_trigger_snooze,fallback_type)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    data["id"],
                    data["profile_id"],
                    data.get("label", "Alarm"),
                    data["alarm_time"],
                    data.get("days", "ONCE"),
                    1 if data.get("is_active", True) else 0,
                    data.get("primary_phrase"),
                    data.get("escalation_phrase_1"),
                    data.get("escalation_phrase_2"),
                    data.get("escalation_phrase_3"),
                    1 if data.get("auto_generate", True) else 0,
                    data.get("language", "en"),
                    data.get("snooze_minutes", 1),
                    data.get("escalation_trigger_snooze", 2),
                    data.get("fallback_type", "BEEP"),
                ),
            )
            await conn.commit()
        return data

    async def get_alarm(self, alarm_id: str) -> dict[str, Any] | None:
        async with self._connect() as conn:
            async with conn.execute("SELECT * FROM alarms WHERE id=?", (alarm_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_alarm_with_profile(self, alarm_id: str) -> dict[str, Any] | None:
        query = """
        SELECT a.*, p.relationship AS relationship_type, p.speaker_wav, p.display_name
        FROM alarms a
        JOIN voice_profiles p ON p.id = a.profile_id
        WHERE a.id = ?
        """
        async with self._connect() as conn:
            async with conn.execute(query, (alarm_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def list_active_alarms(self) -> list[dict[str, Any]]:
        async with self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM alarms WHERE is_active=1 ORDER BY alarm_time"
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def list_active_alarms_with_profiles(self) -> list[dict[str, Any]]:
        query = """
        SELECT a.*, p.relationship AS relationship_type, p.speaker_wav, p.display_name
        FROM alarms a
        JOIN voice_profiles p ON p.id = a.profile_id
        WHERE a.is_active=1
        ORDER BY a.alarm_time
        """
        async with self._connect() as conn:
            async with conn.execute(query) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def update_alarm_last_fired(self, alarm_id: str):
        async with self._connect() as conn:
            await conn.execute(
                "UPDATE alarms SET last_fired=datetime('now') WHERE id=?",
                (alarm_id,),
            )
            await conn.commit()

    async def delete_alarm(self, alarm_id: str):
        async with self._connect() as conn:
            await conn.execute("DELETE FROM alarms WHERE id=?", (alarm_id,))
            await conn.commit()

    async def create_phrase(self, data: dict[str, Any]) -> dict[str, Any]:
        async with self._connect() as conn:
            await conn.execute(
                "INSERT INTO phrases (id,profile_id,phrase_type,text,language,"
                "warmth,urgency,anger,audio_cache)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    data["id"],
                    data["profile_id"],
                    data["phrase_type"],
                    data["text"],
                    data.get("language", "en"),
                    data.get("warmth", 0.7),
                    data.get("urgency", 0.3),
                    data.get("anger", 0.0),
                    data.get("audio_cache"),
                ),
            )
            await conn.commit()
        return data

    async def get_phrase(self, phrase_id: str) -> dict[str, Any] | None:
        async with self._connect() as conn:
            async with conn.execute("SELECT * FROM phrases WHERE id=?", (phrase_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def list_phrases(self, profile_id: str) -> list[dict[str, Any]]:
        async with self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM phrases WHERE profile_id=? ORDER BY created_at DESC",
                (profile_id,),
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def update_phrase_audio_cache(self, phrase_id: str, audio_cache: str):
        async with self._connect() as conn:
            await conn.execute(
                "UPDATE phrases SET audio_cache=? WHERE id=?",
                (audio_cache, phrase_id),
            )
            await conn.commit()

    async def delete_phrase(self, phrase_id: str):
        async with self._connect() as conn:
            await conn.execute("DELETE FROM phrases WHERE id=?", (phrase_id,))
            await conn.commit()

    async def create_conversation(self, data: dict[str, Any]) -> dict[str, Any]:
        async with self._connect() as conn:
            await conn.execute(
                "INSERT INTO conversations (id,profile_id,mode,ended_at)"
                " VALUES (?,?,?,?)",
                (
                    data["id"],
                    data.get("profile_id"),
                    data.get("mode", "PERSONAL"),
                    data.get("ended_at"),
                ),
            )
            await conn.commit()
        return data

    async def end_conversation(self, conversation_id: str):
        async with self._connect() as conn:
            await conn.execute(
                "UPDATE conversations SET ended_at=datetime('now') WHERE id=?",
                (conversation_id,),
            )
            await conn.commit()

    async def add_message(self, data: dict[str, Any]) -> dict[str, Any]:
        async with self._connect() as conn:
            await conn.execute(
                "INSERT INTO messages (id,convo_id,role,text,emotion,audio_path)"
                " VALUES (?,?,?,?,?,?)",
                (
                    data["id"],
                    data["convo_id"],
                    data["role"],
                    data["text"],
                    data.get("emotion"),
                    data.get("audio_path"),
                ),
            )
            await conn.commit()
        return data

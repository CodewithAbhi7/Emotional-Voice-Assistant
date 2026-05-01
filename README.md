 # EVA

EVA is a real-time emotional voice assistant demo that explores what happens when voice AI feels less like a utility and more like a familiar presence. The project combines conversational AI, emotion-aware responses, cloned family-style voices, and intent-aware reminders in a single end-to-end prototype.

## Brief

Current AI assistants are smart, but emotionally blind. They can complete tasks, but they do not offer the warmth, familiarity, or emotional context that many people quietly need during isolation, homesickness, grief, stress, or burnout.

EVA explores a different direction: a personalized voice assistant with emotional context that blends functionality with familiarity. Instead of feeling like a generic tool, the assistant is designed to feel closer to a trusted presence: supportive when needed, practical when required, and more human in everyday interaction.

## Achievement

Selected among the **Top 100 teams across India** and **Top 10 in Mumbai** at the AMD Slingshot Hackathon 2026.

## Demo prototype — not all features are fully implemented.
This repository is a working demo, not a finished production system. The current goal is to validate the interaction model, cloned-voice experience, and emotionally aware reminder flows before pushing toward a more robust product.

## Opportunity

EVA sits in a space that most assistants still ignore: the gap between productivity and emotional presence.

- The distance crisis:
  **students and workers** living away from home often miss daily warmth, not just occasional calls
- The loneliness problem:
  **older adults, isolated users, and people in grief** often need to feel heard, not just reminded
- The silent struggle:
  **many people** are more willing to open up to a non-judgmental AI than to another person in moments of stress or vulnerability

This creates room for assistants that are not just useful, but emotionally meaningful across companionship, routines, caregiving, reminders and voice-first support experiences.

## Current Demo Features

The current demo includes the features that are already working in this repository:

- Familiar voice personas:
  create mom, dad, sibling, mentor, friend, or custom-style voice profiles from short samples
- Dual-mode interaction:
  switch between a personal mode and a professional work mode
  - **Personal Mode** → emotional, conversational interaction  
  - **Professional Mode (EVA trigger)** → task-oriented interaction (e.g., reminders)
- Natural Voice Triggers ("Mom" instead of "Hey Alexa")
  for Professional mode "EVA"
- Real-time chat:
  interact through text or tap-to-speak voice input
- Personal phrases:
  manage and preview custom phrases in the selected cloned voice
- Emotional context:
  responses adapt to detected emotional signals instead of staying purely transactional
- Intent-aware reminders:
  create alarms from direct setup or natural language, including use cases like hydration, medicine, bedtime, meetings, and routines
- Escalating alarm behavior:
  reminders become firmer over time instead of repeating the same neutral alert


## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Zustand, Framer Motion
- Backend: Python 3.11+, FastAPI, Uvicorn, WebSockets, APScheduler, SQLite, AioSQLite
- AI: Gemini Live / Gemini Flash
- Voice: Chatterbox TTS API
- STT: Browser speech recognition plus Gemini transcription flow
- Audio: SoundFile, Librosa, NumPy, SciPy
- Infra: Docker for the Chatterbox CPU voice service

## Project Structure

- `backend/` FastAPI server, WebSocket orchestration, alarm engine, Gemini integration, database, and voice logic
- `frontend/` React app, setup flow, chat UI, alarm management, and phrase management

## Main Entry Points

- `backend/main.py`
- `backend/app/websocket/handler.py`
- `backend/app/alarm/engine.py`
- `backend/app/alarm/reminder_parser.py`
- `backend/app/voice/cloner.py`
- `frontend/src/App.tsx`
- `frontend/src/pages/MainPage.tsx`
- `frontend/src/pages/SetupPage.tsx`
- `frontend/src/pages/AlarmPage.tsx`

## Start the Chatterbox voice service

```powershell
cd C:\
git clone --branch stable https://github.com/travisvn/chatterbox-tts-api
cd chatterbox-tts-api
Copy-Item .env.example.docker .env
docker compose -f docker/docker-compose.cpu.yml up -d
docker logs chatterbox-tts-api-cpu -f
```

## Start the backend

```powershell
cd "C:\Users\Abhi\Downloads\voce assistant 2\backend"
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Start the frontend on new terminal

```powershell
cd "C:\Users\Abhi\Downloads\voce assistant 2\frontend"
npm.cmd install
npm.cmd run dev
```

## Open the app
http://localhost:5173

## Required backend environment
Make sure backend/.env includes:

GEMINI_API_KEY=your_key_here
VOICE_PROVIDER=chatterbox
CHATTERBOX_BASE_URL=http://127.0.0.1:4123


## Collaboration

**Open to collaboration with people interested in AI, voice tech, emotional computing, or product building.**

**Would love to connect and build this further together.**

## 🔮 Future Features (Planned)

- All features updated/upgraded  
- Advanced Emotion Detection (Wav2Vec / prosody analysis)  
- Paralinguistic cues (sighs, pauses, gasps)  
- Adaptive emotional intelligence engine (EQ Layer)  
- Relationship-bound interaction control system  

### 🔐 Security & Safety

- AES-256 Encryption (data security)
- User-controlled privacy modes (local + optional cloud)
- Neural Watermarking (PerTh) for AI-generated voice authentication
- Content Filtering (abuse detection)  
- Pre-Voice Response Validation
- Pre Water mark output (Extreme Scenarios) 
- Relationship Boundaries (approved voice usage)  
- Full Data Deletion & Transparency  

---



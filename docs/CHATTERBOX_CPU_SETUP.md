# Chatterbox CPU Setup

EVA now expects a local Chatterbox TTS API at `http://127.0.0.1:4123`.

For CPU-only machines, use the official Chatterbox Docker deployment from the `stable` branch:

```powershell
cd ..
git clone --branch stable https://github.com/travisvn/chatterbox-tts-api
cd chatterbox-tts-api
Copy-Item .env.example.docker .env
docker compose -f docker/docker-compose.cpu.yml up -d
docker logs chatterbox-tts-api -f
```

Test the service:

```powershell
curl.exe -X POST http://localhost:4123/v1/audio/speech `
  -H "Content-Type: application/json" `
  -d "{\"input\":\"Hello from Chatterbox TTS!\"}" `
  --output test.wav
```

Then start EVA:

```powershell
cd "C:\Users\Abhi\Downloads\voce assistant 2\backend"
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Useful checks:

```powershell
curl.exe http://localhost:4123/health
curl.exe http://localhost:8000/api/health
```

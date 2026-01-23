# Test Audio Files

Audio samples for testing Murmullo's transcription and processing pipeline.

## Files

| File | Description |
|------|-------------|
| `audio_2026-01-23T02-29-50-461Z.wav` | Spanish numbered list test ("Uno, ir al supermercado. Dos, llamar al banco...") |
| `audio_2026-01-23T02-30-34-259Z.wav` | Technical terms test ("deployment", "MCP", "Playwright", etc.) |
| `audio_2026-01-23T02-32-32-123Z.wav` | Additional test sample |
| `audio_2026-01-23T02-33-54-024Z.wav` | Additional test sample |

## Format

- WAV format (16kHz mono, 16-bit PCM)
- Converted from WebM using Web Audio API to avoid Chromium's MediaRecorder bug

## Usage

These files can be used to test:
1. Whisper API transcription accuracy
2. Spanish number word to digit conversion (uno -> 1, dos -> 2, etc.)
3. Technical term preservation in Spanish context
4. List formatting with line breaks

## Capturing New Test Audio

To capture new audio samples, set `SAVE_DEBUG_AUDIO = true` in `main.js` (line 9).
Audio files will be saved to `%APPDATA%/murmullo/debug_audio/`.

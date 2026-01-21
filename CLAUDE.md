# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Murmullo** is an Electron desktop voice dictation app for Spanish-speaking developers. It's a fork of [Open-Whispr](https://github.com/HeroTools/open-whispr) that transcribes Spanish speech while preserving ~70 technical terms in English (git, commit, API, deploy, etc.).

**Current Status**: Planning/specification phase. The `MURMULLO_FRESH_START.md` file contains the complete implementation specification.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, shadcn/ui (Radix), lucide-react
- **Desktop**: Electron 36 with context isolation
- **Storage**: better-sqlite3 for history, localStorage for settings
- **Audio**: MediaRecorder API + ffmpeg-static for conversion
- **APIs**: OpenAI Whisper (transcription), Claude/GPT/Gemini (post-processing)

## Build Commands

```bash
npm install              # Install dependencies
npm run dev              # Development with hot-reload (Electron + Vite)
npm run build:win        # Build Windows installer
npm run build:mac        # Build macOS installer
npm run build:linux      # Build Linux installer
npm run pack             # Build without signing (personal use)
```

## Architecture

### Data Flow
```
1. User presses hotkey (Ctrl+Shift+Space)
2. Main process → IPC → Renderer starts MediaRecorder
3. User presses hotkey again to stop
4. Audio blob → IPC → Main process
5. FFmpeg converts WebM to WAV (16kHz mono)
6. Send to OpenAI Whisper API (or local whisper.cpp)
7. If "Smart Mode": Send to AI for grammar/term correction
8. Final text → Clipboard → Auto-paste (Ctrl+V simulated)
9. Save to SQLite history
```

### Process Structure
```
main.js (Electron main process)
├── WindowManager - Main window (300x200, frameless, always-on-top) + Control Panel (900x700)
├── HotkeyManager - Global hotkey (default: Ctrl+Shift+Space)
├── WhisperManager - Cloud or local transcription
├── ClipboardManager - Copy/paste via PowerShell SendKeys (Windows) or AppleScript (macOS)
├── DatabaseManager - SQLite queries
├── TrayManager - System tray icon
└── IPCHandlers - Communication bridge

src/ (React renderer)
├── App.jsx - Main recording window (Idle/Recording/Processing/Success states)
├── ControlPanel.tsx - Settings panel with tabs
├── hooks/useAudioRecording.js - MediaRecorder capture
└── services/ReasoningService.ts - AI post-processing calls
```

### IPC Bridge (preload.js)
Key handlers: `transcribeAudio`, `pasteText`, `getSetting`, `setSetting`, `getTranscriptions`, `onToggleDictation`

## Key Differences from Open-Whispr

| Feature | Open-Whispr | Murmullo |
|---------|-------------|----------|
| Default hotkey | Backtick (`) | Ctrl+Shift+Space |
| Language focus | English | Spanish with English terms |
| Windows install | Requires admin | No admin needed |

## Technical Term Preservation

The AI post-processor receives a system prompt to preserve English technical terms like: git, commit, push, pull, merge, branch, API, deploy, build, test, frontend, backend, SQL, JOIN, npm, webpack, CI/CD, Docker, React, etc.

## SQLite Schema

```sql
CREATE TABLE transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_text TEXT NOT NULL,
  processed_text TEXT,
  is_processed BOOLEAN DEFAULT 0,
  processing_method TEXT DEFAULT 'none',
  agent_name TEXT,
  error TEXT
);
CREATE INDEX idx_timestamp ON transcriptions(timestamp DESC);
```

## Testing Methodology (Ralph Wiggum Loop)

The project uses a mandatory iterative testing approach defined in `MURMULLO_FRESH_START.md` Section 14:

1. Execute ONE test at a time from the 35-test battery
2. Do NOT advance until current test passes
3. Document results in TEST_RESULTS.md
4. Clean up processes after each cycle

**Critical**: When killing processes, NEVER kill generic `node.exe` (kills Claude). Only kill `electron.exe` and `Murmullo.exe`.

### Test Phases
1. Structure & Build (TEST-01 to TEST-06)
2. UI Basics with Playwright (TEST-07 to TEST-12)
3. Core Functionality (TEST-13 to TEST-20)
4. AI Post-processing (TEST-21 to TEST-26)
5. Persistence & State (TEST-27 to TEST-30)
6. Stability & Cleanup (TEST-31 to TEST-35)

## Known Issues & Recommendations

1. **Settings Panel Freezing**: Avoid combining `sandbox: false` with `frame: false`. Start with `frame: true`.
2. **Port 5174 Occupied**: Dev server may leave orphan processes. Clean up before restart.
3. **Multiple Instances**: Use `app.requestSingleInstanceLock()` to prevent.

**MVP Simplifications**:
- Start with cloud-only mode (skip whisper.cpp)
- Skip auto-updates initially
- Use normal window frames first
- Minimal UI, add features incrementally

## Configuration

### Environment Variables (.env)
```
OPENAI_API_KEY=<key>       # For Whisper + GPT
ANTHROPIC_API_KEY=<key>    # For Claude (recommended for Spanish)
LANGUAGE=es
PROCESSING_MODE=smart      # fast or smart
USE_LOCAL_WHISPER=false
```

### localStorage Keys
`language`, `useLocalWhisper`, `whisperModel`, `reasoningProvider`, `reasoningModel`, `hotkey`, `processingMode`, `hasCompletedOnboarding`

## API Keys

Provided in `MURMULLO_FRESH_START.md` Section 10.

# Murmullo - Especificación para Construcción desde Cero

> Este documento contiene toda la información necesaria para construir Murmullo desde cero en una nueva sesión de Claude Code.

## 1. Descripción del Proyecto

**Murmullo** es una aplicación de escritorio para dictado de voz que:
- Graba audio del micrófono cuando el usuario presiona un hotkey global
- Transcribe el audio usando OpenAI Whisper API (cloud) o whisper.cpp (local)
- Post-procesa el texto con IA (OpenAI/Anthropic/Gemini) para corregir gramática
- Pega automáticamente el texto en la aplicación activa
- Preserva términos técnicos en inglés cuando se dicta en español

**Caso de uso principal**: Desarrolladores hispanoparlantes que dictan código, documentación técnica, y mensajes con terminología de programación.

---

## 2. Stack Tecnológico

### Frontend
- **React 19** con TypeScript/JavaScript
- **Vite** como bundler
- **Tailwind CSS v4** para estilos
- **shadcn/ui** (Radix primitives) para componentes UI
- **lucide-react** para iconos

### Backend/Desktop
- **Electron 36** con context isolation
- **better-sqlite3** para historial local
- **ffmpeg-static** para conversión de audio

### APIs Externas
- **OpenAI Whisper API** - transcripción de voz (cloud)
- **OpenAI GPT** - post-procesamiento de texto
- **Anthropic Claude** - post-procesamiento alternativo
- **Google Gemini** - post-procesamiento alternativo

---

## 3. Arquitectura de la Aplicación

### 3.1 Proceso Principal (main.js)

```
main.js
├── WindowManager - Gestiona ventanas (Main + Control Panel)
├── DatabaseManager - SQLite para historial
├── ClipboardManager - Copiar/pegar texto
├── WhisperManager - Transcripción local con whisper.cpp
├── TrayManager - Icono en system tray
├── HotkeyManager - Registro de hotkeys globales
├── IPCHandlers - Comunicación main↔renderer
└── UpdateManager - Auto-actualizaciones
```

### 3.2 Proceso Renderer (React)

```
src/
├── components/
│   ├── App.jsx - Ventana principal de dictado
│   ├── ControlPanel.tsx - Panel de configuración
│   ├── SettingsModal.tsx - Modal de ajustes
│   ├── OnboardingFlow.tsx - Wizard de configuración inicial
│   └── ui/ - Componentes shadcn/ui
├── hooks/
│   ├── useAudioRecording.js - Grabación con MediaRecorder
│   ├── useHotkey.js - Estado del hotkey
│   ├── useSettings.ts - Gestión de configuración
│   └── useToast.ts - Notificaciones
├── services/
│   └── ReasoningService.ts - Llamadas a APIs de IA
└── helpers/
    └── audioManager.js - Gestión de audio (renderer)
```

### 3.3 Flujo de Datos

```
1. Usuario presiona HOTKEY
   ↓
2. Main process emite 'toggle-dictation' via IPC
   ↓
3. Renderer inicia MediaRecorder (captura audio)
   ↓
4. Usuario presiona HOTKEY nuevamente
   ↓
5. Renderer detiene grabación → obtiene Blob
   ↓
6. Blob → ArrayBuffer → IPC → Main process
   ↓
7. Main process:
   a) Guarda audio temporal (.webm)
   b) Convierte a WAV con FFmpeg (16kHz mono)
   c) Envía a Whisper API o whisper.cpp local
   d) Recibe transcripción
   ↓
8. Si "Smart Mode" activado:
   Transcripción → ReasoningService → API de IA → Texto corregido
   ↓
9. Texto final → Clipboard → Simula Ctrl+V
   ↓
10. Guarda en SQLite para historial
```

---

## 4. Componentes Clave a Implementar

### 4.1 Ventana Principal (App.jsx)

Estados visuales:
- **Idle**: "Press hotkey to start"
- **Recording**: Indicador pulsante rojo
- **Processing**: Spinner de carga
- **Success**: Checkmark verde (2 segundos)
- **Error**: Mensaje de error

Características:
- Ventana pequeña, siempre visible (always on top)
- Arrastrable
- Transparente/semi-transparente
- Click-through cuando está idle

### 4.2 Panel de Control (ControlPanel.tsx)

Secciones:
1. **General**: Idioma, tema
2. **Transcription**: Modo local/cloud, modelo Whisper
3. **AI Processing**: Proveedor, modelo, API keys
4. **Hotkey**: Configuración del atajo de teclado
5. **History**: Lista de transcripciones recientes

### 4.3 Grabación de Audio (useAudioRecording.js)

```javascript
// Configuración óptima para Whisper
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 128000
});

// Chunks se acumulan en array
mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

// Al detener, crear Blob y enviar via IPC
mediaRecorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  // Convertir a ArrayBuffer y enviar
};
```

### 4.4 Transcripción (WhisperManager)

**Modo Cloud (OpenAI)**:
```javascript
const formData = new FormData();
formData.append('file', audioBuffer, 'audio.wav');
formData.append('model', 'whisper-1');
formData.append('language', 'es');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: formData
});
```

**Modo Local (whisper.cpp)**:
```javascript
// Convertir audio a WAV 16kHz mono con FFmpeg
// Ejecutar whisper.cpp CLI
const args = ['-m', modelPath, '-f', audioPath, '--output-json', '-l', language];
spawn(whisperBinaryPath, args);
```

### 4.5 Post-procesamiento con IA (ReasoningService)

**System Prompt para español técnico**:
```
Eres un asistente de post-procesamiento para dictado de voz en español técnico.
Tu trabajo es:
1. Corregir errores de transcripción y gramática en español
2. MANTENER términos técnicos en inglés: git, commit, push, pull, merge, API, etc.
3. Agregar puntuación apropiada
4. Formatear código inline con backticks (ej: `git push`)
5. NO traducir nombres de comandos, funciones, o tecnologías
6. Output SOLO el texto corregido sin explicaciones
```

**Términos técnicos a preservar**:
```javascript
const TECHNICAL_TERMS = [
  // Git
  "git", "commit", "push", "pull", "merge", "branch", "checkout", "rebase",
  "stash", "clone", "fork", "PR", "pull request",
  // Desarrollo
  "deploy", "build", "test", "debug", "refactor", "API", "endpoint",
  "frontend", "backend", "framework", "library", "runtime",
  // Bases de datos
  "SQL", "query", "database", "schema", "migration", "JOIN", "SELECT",
  // Tecnologías
  "JavaScript", "TypeScript", "Python", "React", "Node.js", "Docker",
  // Herramientas
  "npm", "yarn", "pip", "webpack", "vite", "eslint", "CI/CD"
];
```

### 4.6 Clipboard y Auto-paste (ClipboardManager)

**Windows**:
```javascript
// Opción 1: PowerShell SendKeys
spawn('powershell.exe', [
  '-NoProfile', '-NonInteractive',
  '-Command',
  "[System.Windows.Forms.SendKeys]::SendWait('^v')"
]);

// Opción 2: nircmd (más rápido)
spawn(nircmdPath, ['sendkeypress', 'ctrl+v']);
```

**macOS**:
```javascript
// AppleScript
spawn('osascript', [
  '-e', 'tell application "System Events" to keystroke "v" using command down'
]);
```

### 4.7 Hotkey Global (HotkeyManager)

```javascript
const { globalShortcut } = require('electron');

// Registrar hotkey
globalShortcut.register('CommandOrControl+Shift+Space', () => {
  mainWindow.webContents.send('toggle-dictation');
});

// Hotkey por defecto para Murmullo: Ctrl+Shift+Space
// (diferente de Open-Whispr que usa backtick)
```

---

## 5. Configuración IPC (preload.js)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Transcripción
  transcribeAudio: (audioData, options) =>
    ipcRenderer.invoke('transcribe-audio', audioData, options),

  // Clipboard
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),

  // API Keys
  getOpenAIKey: () => ipcRenderer.invoke('get-openai-key'),
  setOpenAIKey: (key) => ipcRenderer.invoke('set-openai-key', key),
  getAnthropicKey: () => ipcRenderer.invoke('get-anthropic-key'),
  setAnthropicKey: (key) => ipcRenderer.invoke('set-anthropic-key', key),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // Database
  getTranscriptions: () => ipcRenderer.invoke('get-transcriptions'),
  saveTranscription: (data) => ipcRenderer.invoke('save-transcription', data),

  // Events
  onToggleDictation: (callback) => {
    ipcRenderer.on('toggle-dictation', callback);
    return () => ipcRenderer.removeListener('toggle-dictation', callback);
  }
});
```

---

## 6. Base de Datos (SQLite)

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

---

## 7. Configuración de Electron

### 7.1 Ventana Principal
```javascript
const mainWindow = new BrowserWindow({
  width: 300,
  height: 200,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
});
```

### 7.2 Panel de Control
```javascript
const controlPanel = new BrowserWindow({
  width: 900,
  height: 700,
  show: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
});
```

---

## 8. Estructura de Archivos Recomendada

```
murmullo/
├── main.js                 # Entry point Electron
├── preload.js              # IPC bridge
├── package.json
├── electron-builder.json   # Config de build
├── src/
│   ├── index.html
│   ├── main.jsx            # Entry point React
│   ├── App.jsx             # Ventana principal
│   ├── ControlPanel.tsx    # Panel de control
│   ├── components/
│   │   ├── ui/             # shadcn components
│   │   ├── SettingsModal.tsx
│   │   └── OnboardingFlow.tsx
│   ├── hooks/
│   │   ├── useAudioRecording.js
│   │   ├── useSettings.ts
│   │   └── useHotkey.js
│   ├── services/
│   │   └── ReasoningService.ts
│   ├── helpers/
│   │   └── audioManager.js
│   └── styles/
│       └── globals.css
├── helpers/                # Módulos del main process
│   ├── windowManager.js
│   ├── whisperManager.js
│   ├── clipboardManager.js
│   ├── databaseManager.js
│   ├── hotkeyManager.js
│   ├── trayManager.js
│   └── ipcHandlers.js
└── resources/
    └── bin/                # Binarios whisper.cpp
```

---

## 9. Dependencias Esenciales

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-select": "^2.2.0",
    "better-sqlite3": "^11.0.0",
    "ffmpeg-static": "^5.2.0",
    "lucide-react": "^0.500.0",
    "tailwind-merge": "^3.0.0",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "electron": "^36.0.0",
    "electron-builder": "^24.0.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.0.0",
    "concurrently": "^8.0.0"
  }
}
```

---

## 10. API Keys y Configuración

### Variables de entorno (.env)
```env
# =============================================================================
# MURMULLO - Configuración
# =============================================================================

# -----------------------------------------------------------------------------
# API KEYS
# -----------------------------------------------------------------------------

# OpenAI - Para transcripción (Whisper) y post-procesamiento (GPT)
OPENAI_API_KEY=your-openai-api-key-here

# Anthropic - Para post-procesamiento con Claude (recomendado para español)
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# -----------------------------------------------------------------------------
# CONFIGURACIÓN DE TRANSCRIPCIÓN
# -----------------------------------------------------------------------------

# Idioma preferido para transcripción
LANGUAGE=es

# Modelo de Whisper para transcripción cloud
WHISPER_MODEL=whisper-1

# -----------------------------------------------------------------------------
# CONFIGURACIÓN DE MURMULLO
# -----------------------------------------------------------------------------

# Modo de procesamiento por defecto (fast = solo transcripción, smart = con IA)
PROCESSING_MODE=smart

# -----------------------------------------------------------------------------
# WHISPER LOCAL (OPCIONAL)
# -----------------------------------------------------------------------------

USE_LOCAL_WHISPER=false
LOCAL_WHISPER_MODEL=base

# -----------------------------------------------------------------------------
# DEBUG
# -----------------------------------------------------------------------------

DEBUG=false
```

### localStorage keys
```javascript
// Settings
'language'          // 'es', 'en', 'auto'
'useLocalWhisper'   // 'true' | 'false'
'whisperModel'      // 'base', 'small', 'medium', etc.
'reasoningProvider' // 'openai', 'anthropic', 'gemini'
'reasoningModel'    // 'gpt-4', 'claude-3-opus', etc.
'hotkey'            // 'CommandOrControl+Shift+Space'
'processingMode'    // 'fast' | 'smart'
'hasCompletedOnboarding' // 'true' | 'false'
```

---

## 11. Flujo de Onboarding

1. **Welcome**: Introducción a Murmullo
2. **Privacy**: Explicar modo local vs cloud
3. **API Setup**: Configurar API keys
4. **Microphone**: Probar permisos de micrófono
5. **Hotkey Test**: Probar hotkey y primera grabación
6. **Language**: Seleccionar idioma
7. **Agent Name** (opcional): Nombre para comandos de voz
8. **Complete**: Resumen y comenzar

---

## 12. Manejo de Errores

### Errores comunes y mensajes
```javascript
const ERROR_MESSAGES = {
  NO_MIC_PERMISSION: "Microphone access denied. Please enable in system settings.",
  TRANSCRIPTION_FAILED: "Failed to transcribe audio. Please try again.",
  API_KEY_MISSING: "API key not configured. Please add it in Settings.",
  NETWORK_ERROR: "Network error. Check your internet connection.",
  WHISPER_NOT_FOUND: "Local Whisper not available. Using cloud mode.",
  PASTE_FAILED: "Auto-paste failed. Text copied to clipboard."
};
```

---

## 13. Instrucciones para Claude Code

### Prompt inicial recomendado:

```
Lee el archivo MURMULLO_FRESH_START.md completo antes de empezar.

Vamos a construir Murmullo desde cero usando la METODOLOGÍA LOOP RALPH WIGGUM
(sección 14 del documento). Esta metodología es OBLIGATORIA.

REGLAS DEL LOOP RALPH WIGGUM:
1. Definir batería de pruebas ANTES de codificar
2. Ejecutar UNA prueba a la vez - NO avanzar hasta que pase
3. Si falla: corregir → volver a probar → repetir
4. Documentar cada resultado en TEST_RESULTS.md
5. NUNCA hacer kill a procesos de Claude (solo electron.exe y Murmullo.exe)
6. Verificar que no queden procesos fantasma después de cada ciclo
7. Solo terminar cuando TODAS las 35 pruebas pasen

CARACTERÍSTICAS A IMPLEMENTAR:
1. Electron app con React 19 + Vite + Tailwind CSS v4
2. Grabación de audio con MediaRecorder API
3. Transcripción con OpenAI Whisper API
4. Post-procesamiento con OpenAI/Anthropic para corregir gramática
5. Auto-paste del texto transcrito
6. Preservación de términos técnicos en inglés

API KEYS (configurar en archivo .env local):
- OpenAI: tu-api-key-de-openai
- Anthropic: tu-api-key-de-anthropic

VERSIÓN SIMPLIFICADA INICIAL:
- Solo modo cloud (OpenAI Whisper API) - sin whisper.cpp local
- Ventanas con frame normal (frame: true)
- UI minimalista

PROCESO:
1. Leer documento completo
2. Usar la carpeta actual (murmullo) - ya está limpia
3. Definir las 35 pruebas del documento
4. Implementar feature mínimo
5. Ejecutar TEST-01
6. Si pasa: documentar ✅, ir a TEST-02
7. Si falla: corregir, volver a TEST-01
8. Repetir hasta TEST-35
9. Solo terminar cuando TODAS pasen

⚠️ CRÍTICO - PROTEGER PROCESO DE CLAUDE:
Al hacer cleanup de procesos, NUNCA ejecutar:
  - taskkill /F /IM node.exe (esto mata a Claude)
  - Cualquier kill genérico de Node

SOLO ejecutar:
  - taskkill /F /IM electron.exe
  - taskkill /F /IM "Murmullo.exe"
```

---

## 14. Metodología Loop Ralph Wiggum

> **IMPORTANTE**: Esta metodología es OBLIGATORIA. Claude debe iterar continuamente hasta que la aplicación funcione completamente.

### 14.1 Principios del Loop

1. **NO terminar hasta que funcione** - Seguir iterando hasta que TODAS las pruebas pasen
2. **Una prueba a la vez** - NO avanzar a la siguiente prueba hasta que la actual pase
3. **Documentar todo** - Registrar cada resultado de prueba
4. **Automatizar** - Usar Playwright para pruebas de UI cuando sea posible
5. **Limpiar procesos** - Nunca dejar procesos fantasma

### 14.2 Batería de Pruebas (Ejecutar en orden)

#### FASE 1: Estructura y Build
```
[ ] TEST-01: npm install completa sin errores
[ ] TEST-02: npm run dev inicia sin errores
[ ] TEST-03: Vite server responde en localhost:5174
[ ] TEST-04: Electron abre ventana principal
[ ] TEST-05: Electron abre panel de control
[ ] TEST-06: npm run dev termina limpiamente (sin procesos huérfanos)
```

#### FASE 2: UI Básica (usar Playwright)
```
[ ] TEST-07: Ventana principal renderiza correctamente
[ ] TEST-08: Panel de control renderiza correctamente
[ ] TEST-09: Click en Settings NO congela la app (respuesta < 1 segundo)
[ ] TEST-10: Navegación entre secciones de Settings funciona
[ ] TEST-11: Scroll en Settings NO congela la app
[ ] TEST-12: Cerrar Settings funciona
```

#### FASE 3: Funcionalidad Core
```
[ ] TEST-13: Hotkey global se registra correctamente
[ ] TEST-14: Presionar hotkey cambia estado a "Recording"
[ ] TEST-15: MediaRecorder captura audio del micrófono
[ ] TEST-16: Presionar hotkey de nuevo detiene grabación
[ ] TEST-17: Audio se envía correctamente via IPC
[ ] TEST-18: Transcripción con OpenAI Whisper funciona
[ ] TEST-19: Texto transcrito aparece en clipboard
[ ] TEST-20: Auto-paste funciona (Ctrl+V simulado)
```

#### FASE 4: Post-procesamiento IA
```
[ ] TEST-21: API key de OpenAI se lee correctamente
[ ] TEST-22: API key de Anthropic se lee correctamente
[ ] TEST-23: Modo "Smart" envía texto a API de IA
[ ] TEST-24: Respuesta de IA se recibe correctamente
[ ] TEST-25: Términos técnicos se preservan en inglés
[ ] TEST-26: Texto procesado se pega correctamente
```

#### FASE 5: Persistencia y Estado
```
[ ] TEST-27: Transcripción se guarda en SQLite
[ ] TEST-28: Historial se carga correctamente
[ ] TEST-29: Settings se guardan en localStorage
[ ] TEST-30: Settings persisten después de reiniciar app
```

#### FASE 6: Estabilidad y Limpieza
```
[ ] TEST-31: Abrir/cerrar app 5 veces NO deja procesos fantasma
[ ] TEST-32: App responde después de 10 transcripciones seguidas
[ ] TEST-33: Memory leak check - memoria no crece indefinidamente
[ ] TEST-34: Error handling - app no crashea con audio vacío
[ ] TEST-35: Error handling - app no crashea sin internet
```

### 14.3 Script de Pruebas Automatizadas

Crear archivo `test-suite.mjs` con Playwright:

```javascript
import { chromium } from 'playwright';
import { spawn, exec } from 'child_process';

// IMPORTANTE: Nunca matar procesos de Claude
const PROTECTED_PROCESSES = ['claude', 'Claude'];

async function killAppProcesses() {
  return new Promise((resolve) => {
    // Windows: matar solo Electron y Node de la app, NO Claude
    if (process.platform === 'win32') {
      // Primero obtener lista de procesos
      exec('tasklist /FO CSV', (err, stdout) => {
        const lines = stdout.split('\n');
        const toKill = [];

        for (const line of lines) {
          // Solo matar electron.exe y node.exe que NO sean de Claude
          if (line.includes('electron.exe') || line.includes('Murmullo')) {
            const match = line.match(/"([^"]+)","(\d+)"/);
            if (match) {
              const [, name, pid] = match;
              // Verificar que NO sea proceso de Claude
              const isProtected = PROTECTED_PROCESSES.some(p =>
                name.toLowerCase().includes(p.toLowerCase())
              );
              if (!isProtected) {
                toKill.push(pid);
              }
            }
          }
        }

        // Matar procesos identificados
        for (const pid of toKill) {
          exec(`taskkill /F /PID ${pid}`, () => {});
        }

        setTimeout(resolve, 1000);
      });
    } else {
      resolve();
    }
  });
}

async function checkNoGhostProcesses() {
  return new Promise((resolve) => {
    exec('tasklist /FO CSV | findstr /I "electron murmullo"', (err, stdout) => {
      const hasGhosts = stdout && stdout.trim().length > 0;
      resolve(!hasGhosts);
    });
  });
}

async function measureResponseTime(page, action, maxMs = 1000) {
  const start = Date.now();
  await action();
  const elapsed = Date.now() - start;
  return {
    passed: elapsed < maxMs,
    elapsed,
    maxAllowed: maxMs
  };
}

// Ejecutar batería de pruebas
async function runTestSuite() {
  const results = [];

  console.log('🧪 INICIANDO BATERÍA DE PRUEBAS RALPH WIGGUM\n');
  console.log('=' .repeat(60));

  // Limpiar antes de empezar
  await killAppProcesses();

  // ... implementar cada TEST-XX aquí ...

  // Al final, verificar que no quedaron procesos fantasma
  const noGhosts = await checkNoGhostProcesses();
  results.push({
    test: 'TEST-FINAL: No ghost processes',
    passed: noGhosts
  });

  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE PRUEBAS');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`✅ Pasaron: ${passed}`);
  console.log(`❌ Fallaron: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ PRUEBAS FALLIDAS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.test}`);
    });
    console.log('\n🔄 LOOP RALPH WIGGUM: Corregir y volver a ejecutar');
  } else {
    console.log('\n🎉 TODAS LAS PRUEBAS PASARON');
    console.log('✅ Loop Ralph Wiggum completado exitosamente');
  }

  return failed === 0;
}

runTestSuite();
```

### 14.4 Reglas Críticas del Loop

#### NUNCA hacer kill a Claude
```javascript
// ❌ PROHIBIDO - Esto mata a Claude
exec('taskkill /F /IM node.exe');

// ✅ CORRECTO - Solo matar procesos específicos de la app
exec('taskkill /F /IM electron.exe');
exec('taskkill /F /IM "Murmullo.exe"');

// ✅ MEJOR - Verificar antes de matar
const isClaudeProcess = processName.toLowerCase().includes('claude');
if (!isClaudeProcess) {
  // Safe to kill
}
```

#### Verificar procesos fantasma después de cada ciclo
```javascript
// Después de cerrar la app, esperar y verificar
await app.quit();
await sleep(2000);

const ghostProcesses = await getRunningProcesses('electron|murmullo');
if (ghostProcesses.length > 0) {
  console.log('⚠️ PROCESOS FANTASMA DETECTADOS:', ghostProcesses);
  // Limpiar solo los de la app, no Claude
  await killAppProcesses();
}
```

#### Medir tiempos de respuesta
```javascript
// Cada acción de UI debe responder en < 1 segundo
const TIMEOUT_MS = 1000;

const result = await measureResponseTime(page, async () => {
  await page.click('button:has-text("Settings")');
}, TIMEOUT_MS);

if (!result.passed) {
  console.log(`❌ UI FREEZE DETECTADO: ${result.elapsed}ms > ${TIMEOUT_MS}ms`);
  // NO avanzar - corregir primero
}
```

### 14.5 Flujo del Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    LOOP RALPH WIGGUM                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CONSTRUIR                                               │
│     └─> Implementar feature/fix                             │
│                                                             │
│  2. LIMPIAR PROCESOS                                        │
│     └─> killAppProcesses() (NUNCA Claude)                   │
│                                                             │
│  3. EJECUTAR PRUEBA ACTUAL                                  │
│     └─> Solo UNA prueba a la vez                            │
│                                                             │
│  4. ¿PASÓ?                                                  │
│     ├─> SÍ: Documentar ✅, avanzar a siguiente prueba       │
│     └─> NO: Documentar ❌, volver a paso 1                  │
│                                                             │
│  5. ¿TODAS LAS PRUEBAS PASARON?                             │
│     ├─> SÍ: 🎉 FIN DEL LOOP                                 │
│     └─> NO: Continuar con siguiente prueba                  │
│                                                             │
│  6. VERIFICAR PROCESOS FANTASMA                             │
│     └─> Si hay, limpiar (NUNCA Claude)                      │
│                                                             │
│  REPETIR hasta que todas las pruebas pasen                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 14.6 Documentación de Resultados

Mantener un log de pruebas en `TEST_RESULTS.md`:

```markdown
# Resultados de Pruebas - Loop Ralph Wiggum

## Ciclo 1 - [Fecha/Hora]
| Test | Resultado | Tiempo | Notas |
|------|-----------|--------|-------|
| TEST-01 | ✅ PASS | 45s | npm install ok |
| TEST-02 | ✅ PASS | 3s | dev server ok |
| TEST-03 | ❌ FAIL | - | Puerto ocupado |

### Acción correctiva para TEST-03:
- Problema: Puerto 5174 ocupado por proceso huérfano
- Solución: Agregar cleanup en script de inicio
- Resultado: Pendiente re-test

## Ciclo 2 - [Fecha/Hora]
...
```

---

## 15. Notas Importantes

### Problemas conocidos del proyecto original
1. **Settings freezing**: El panel de configuración se congela en Electron pero funciona en navegador. Evitar configuraciones complejas de `sandbox: false` y `frame: false` juntas.

2. **Múltiples instancias**: Usar `app.requestSingleInstanceLock()` para prevenir.

3. **Puertos ocupados**: El dev server puede quedar en puerto 5174. Matar procesos huérfanos.

### Simplificaciones recomendadas
1. Usar solo modo cloud inicialmente (evita complejidad de whisper.cpp)
2. Empezar sin auto-updates (electron-updater)
3. Empezar con frame:true en ventanas (evita problemas de drag)
4. UI minimalista primero, features avanzados después

---

**Fecha de creación**: Enero 2026
**Basado en**: Open-Whispr v1.2.12 + modificaciones Murmullo

# INFORME EDUCATIVO: Cómo Funciona Murmullo

> Guía completa para entender la arquitectura y funcionamiento de la aplicación de dictado por voz.

## Índice

1. [Visión General](#1-visión-general)
2. [Las Tecnologías Involucradas](#2-las-tecnologías-involucradas)
3. [Arquitectura de Electron](#3-arquitectura-de-electron)
4. [El Viaje de tu Voz: Flujo Completo](#4-el-viaje-de-tu-voz-flujo-completo)
5. [Los Archivos y Su Propósito](#5-los-archivos-y-su-propósito)
6. [Comunicación Entre Procesos (IPC)](#6-comunicación-entre-procesos-ipc)
7. [Las APIs Externas](#7-las-apis-externas)
8. [Almacenamiento de Datos](#8-almacenamiento-de-datos)
9. [Conceptos Clave para Recordar](#9-conceptos-clave-para-recordar)

---

## 1. Visión General

### ¿Qué es Murmullo?

Murmullo es una aplicación de **dictado por voz** para desarrolladores hispanohablantes. La magia está en que:

1. **Presionas un atajo de teclado** (Ctrl+Shift+Space)
2. **Hablas** en español
3. **Presionas el atajo de nuevo** para detener
4. **El texto aparece** donde tengas el cursor (en tu editor, navegador, donde sea)

Lo especial es que **preserva términos técnicos en inglés**: si dices "haz un commit y luego un push al branch main", no lo traduce a "compromiso" o "rama", mantiene las palabras técnicas.

### Componentes de Alto Nivel

```
┌─────────────────────────────────────────────────────────┐
│                    TU COMPUTADORA                       │
│                                                         │
│   ┌─────────┐      ┌──────────────┐      ┌─────────┐   │
│   │   TÚ    │ ──▶  │   MURMULLO   │ ──▶  │  TEXTO  │   │
│   │(hablando)│      │ (procesa)   │      │(pegado) │   │
│   └─────────┘      └──────────────┘      └─────────┘   │
│                           │                             │
│                           ▼                             │
│                    ┌──────────────┐                     │
│                    │   INTERNET   │                     │
│                    │  (APIs de IA)│                     │
│                    └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Las Tecnologías Involucradas

### El Stack Tecnológico

| Capa | Tecnología | ¿Para qué sirve? |
|------|------------|------------------|
| **Escritorio** | Electron 33 | Permite crear apps de escritorio con tecnologías web |
| **Frontend** | React 19 | Biblioteca para construir interfaces de usuario |
| **Bundler** | Vite 6 | Empaqueta y sirve el código JavaScript/React |
| **Estilos** | Tailwind CSS 3 | Framework de CSS utilitario |
| **Base de datos** | sql.js | SQLite compilado a JavaScript (corre en memoria) |
| **APIs** | OpenAI Whisper | Convierte audio a texto (speech-to-text) |
| **APIs** | Claude/GPT | Corrige gramática y preserva términos técnicos |

### ¿Por qué Electron?

Electron permite crear aplicaciones de escritorio usando HTML, CSS y JavaScript. La ventaja:

- **Un solo código** que funciona en Windows, Mac y Linux
- **Acceso al sistema operativo**: leer archivos, ejecutar comandos, registrar atajos globales
- **Interfaz web familiar**: React, CSS, etc.

El "truco" de Electron es que **empaqueta un navegador Chromium completo** dentro de tu app. Por eso las apps Electron pueden ser pesadas (~150MB), pero ganas la flexibilidad de las tecnologías web.

---

## 3. Arquitectura de Electron

### Los Dos Mundos de Electron

Electron tiene **dos tipos de procesos** que son fundamentales entender:

```
┌─────────────────────────────────────────────────────────────┐
│                    PROCESO PRINCIPAL                        │
│                      (main.js)                              │
│                                                             │
│  ✅ Acceso completo a Node.js                              │
│  ✅ Puede leer/escribir archivos                           │
│  ✅ Puede ejecutar comandos del sistema                    │
│  ✅ Puede hacer llamadas HTTP a APIs                       │
│  ✅ Puede registrar atajos de teclado globales            │
│  ✅ Crea y controla las ventanas                          │
│                                                             │
│  🔒 NO tiene interfaz visual (es "invisible")              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (Comunicación)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   PROCESO RENDERER                          │
│                (App.jsx, ControlPanel.jsx)                  │
│                                                             │
│  ✅ Muestra la interfaz visual (HTML/CSS/React)            │
│  ✅ Responde a clicks del usuario                          │
│  ✅ Puede acceder al micrófono (MediaRecorder API)         │
│                                                             │
│  🔒 NO puede acceder al sistema de archivos               │
│  🔒 NO puede ejecutar comandos del sistema                │
│  🔒 NO puede hacer ciertas llamadas HTTP (CORS)           │
└─────────────────────────────────────────────────────────────┘
```

### ¿Por qué esta separación?

**Seguridad**. Si el renderer pudiera hacer todo, una página web maliciosa podría borrar tus archivos o robar información. La separación fuerza que las operaciones "peligrosas" pasen por el proceso principal, que es código que tú controlas.

### El Puente: preload.js

El archivo `preload.js` es el **puente seguro** entre los dos mundos:

```javascript
// preload.js - Expone SOLO funciones específicas al renderer
contextBridge.exposeInMainWorld('electronAPI', {
  transcribeAudio: (data, opts) => ipcRenderer.invoke('transcribe-audio', data, opts),
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),
  // ... solo lo necesario
});
```

En el renderer (React) puedes usar `window.electronAPI.transcribeAudio()` pero NO puedes usar `require('fs')` o acceder a archivos directamente.

---

## 4. El Viaje de tu Voz: Flujo Completo

Esta es la parte más importante. Vamos paso a paso desde que presionas el atajo hasta que el texto aparece:

### PASO 1: Registrar el Atajo Global

Cuando la app inicia, `main.js` registra el atajo de teclado:

```javascript
// main.js línea ~280
globalShortcut.register('Ctrl+Shift+Space', () => {
  mainWindow.webContents.send('toggle-dictation');
});
```

Este atajo funciona **globalmente** - aunque Murmullo esté minimizado o en segundo plano, el atajo siempre funciona.

### PASO 2: Iniciar Grabación

Cuando presionas Ctrl+Shift+Space, esto sucede:

```
main.js                          App.jsx (React)
   │                                  │
   │ ──── 'toggle-dictation' ──────▶ │
   │      (mensaje IPC)               │
   │                                  │
   │                            onToggleDictation()
   │                                  │
   │                            startRecording()
   │                                  │
   │                            navigator.mediaDevices
   │                            .getUserMedia({audio})
   │                                  │
   │                            MediaRecorder.start()
   │                                  │
   │                            status = RECORDING
```

**Código relevante en App.jsx (~línea 90):**

```javascript
const startRecording = async () => {
  // Pedir permiso al micrófono
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,        // Mono (un solo canal)
      sampleRate: 16000,      // 16kHz (lo que espera Whisper)
      echoCancellation: true,  // Eliminar eco
      noiseSuppression: true   // Reducir ruido de fondo
    }
  });

  // Crear grabador
  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

  // Empezar a grabar
  recorder.start(100); // Guardar datos cada 100ms

  setStatus(STATUS.RECORDING);
};
```

### PASO 3: Mientras Hablas

El `MediaRecorder` está capturando tu voz y guardándola en memoria:

```javascript
// Cada 100ms se ejecuta esto:
recorder.ondataavailable = (event) => {
  chunks.push(event.data);  // Acumular pedazos de audio
};
```

La interfaz muestra un círculo rojo pulsante para indicar que está grabando.

### PASO 4: Detener Grabación

Cuando presionas Ctrl+Shift+Space de nuevo:

```javascript
const stopRecording = () => {
  mediaRecorder.stop();  // Dispara el evento 'onstop'
  setStatus(STATUS.PROCESSING);
};
```

### PASO 5: Procesar el Audio

El evento `onstop` del MediaRecorder se dispara:

```javascript
recorder.onstop = async () => {
  // Unir todos los pedazos en un Blob
  const audioBlob = new Blob(chunks, { type: 'audio/webm' });

  // Convertir a array de bytes para enviar
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioData = new Uint8Array(arrayBuffer);

  // Enviar al proceso principal para transcribir
  await processAudio(audioData);
};
```

### PASO 6: Enviar a Whisper (API de OpenAI)

El renderer envía el audio al main process vía IPC:

```
App.jsx                          main.js
   │                                │
   │ ── transcribeAudio(data) ───▶ │
   │                                │
   │                         Construir FormData
   │                                │
   │                         fetch() a OpenAI
   │                                │
   │                          ┌─────────────┐
   │                          │   INTERNET  │
   │                          │   OpenAI    │
   │                          │   Whisper   │
   │                          └─────────────┘
   │                                │
   │                          { text: "..." }
   │                                │
   │ ◀─── texto transcrito ─────── │
```

**Código en main.js (~línea 450):**

```javascript
ipcMain.handle('transcribe-audio', async (event, audioData, options) => {
  // Construir FormData manualmente (Node.js no tiene FormData nativo)
  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="file"; filename="audio.webm"\r\n'),
    Buffer.from('Content-Type: audio/webm\r\n\r\n'),
    Buffer.from(audioData),
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="model"\r\n\r\n'),
    Buffer.from('whisper-1'),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });

  const result = await response.json();
  return result.text;  // "haz un commit al branch main"
});
```

### PASO 7: Corrección con IA (Modo Smart)

Si tienes activado el modo "smart", el texto pasa por Claude o GPT:

```
App.jsx                          main.js                      Claude/GPT
   │                                │                              │
   │ ── processText(texto) ──────▶ │                              │
   │                                │                              │
   │                                │ ── fetch() ───────────────▶ │
   │                                │                              │
   │                                │    System prompt:            │
   │                                │    "Corrige gramática pero   │
   │                                │     mantén: git, commit,     │
   │                                │     push, branch, API..."    │
   │                                │                              │
   │                                │ ◀─ texto corregido ──────── │
   │                                │                              │
   │ ◀─── texto final ───────────── │                              │
```

**El prompt del sistema (~línea 520):**

```javascript
const systemPrompt = `Eres un corrector de transcripciones de voz para desarrolladores.
Tu trabajo es:
1. Corregir errores de puntuación y gramática
2. MANTENER en inglés estos términos técnicos: git, commit, push, pull, merge,
   branch, API, deploy, build, test, frontend, backend, SQL, npm, webpack,
   Docker, React, component, hook, state, props...
3. NO agregar ni quitar contenido, solo corregir
4. Devolver SOLO el texto corregido, sin explicaciones`;
```

### PASO 8: Pegar el Texto

Ahora viene la magia de pegar el texto donde tengas el cursor:

```javascript
ipcMain.handle('paste-text', async (event, text) => {
  // 1. Guardar lo que había en el clipboard (para restaurarlo después)
  const originalClipboard = clipboard.readText();

  // 2. Poner nuestro texto en el clipboard
  clipboard.writeText(text);

  // 3. Ocultar la ventana de Murmullo (para que el foco vuelva a tu app)
  mainWindow.hide();

  // 4. Esperar un poquito
  await sleep(100);

  // 5. Simular Ctrl+V
  if (process.platform === 'win32') {
    // En Windows, usar PowerShell para simular teclas
    spawn('powershell.exe', [
      '-Command',
      '[System.Windows.Forms.SendKeys]::SendWait("^v")'
    ]);
  }

  // 6. Esperar a que pegue
  await sleep(150);

  // 7. Restaurar el clipboard original (o vaciarlo si estaba vacío)
  if (originalClipboard) {
    clipboard.writeText(originalClipboard);
  } else {
    clipboard.clear();
  }
});
```

### PASO 9: Guardar en el Historial

Finalmente, se guarda la transcripción en la base de datos:

```javascript
ipcMain.handle('save-transcription', async (event, data) => {
  db.run(`
    INSERT INTO transcriptions
    (original_text, processed_text, is_processed, processing_method)
    VALUES (?, ?, ?, ?)
  `, [data.original_text, data.processed_text, data.is_processed ? 1 : 0, data.processing_method]);

  // Persistir a disco
  saveDatabase();
});
```

### Diagrama Completo del Flujo

```
USUARIO                  RENDERER (React)              MAIN (Node.js)              APIS EXTERNAS
   │                          │                             │                           │
   │ Ctrl+Shift+Space         │                             │                           │
   │ ─────────────────────────┼──────────────────────────▶ │                           │
   │                          │ ◀── toggle-dictation ───── │                           │
   │                          │                             │                           │
   │                     startRecording()                   │                           │
   │                     MediaRecorder.start()              │                           │
   │                          │                             │                           │
   │ (habla)                  │                             │                           │
   │ ═════════════════════▶  │                             │                           │
   │                     (grabando chunks)                  │                           │
   │                          │                             │                           │
   │ Ctrl+Shift+Space         │                             │                           │
   │ ─────────────────────────┼──────────────────────────▶ │                           │
   │                          │ ◀── toggle-dictation ───── │                           │
   │                          │                             │                           │
   │                     stopRecording()                    │                           │
   │                     audioBlob = Blob(chunks)           │                           │
   │                          │                             │                           │
   │                          │ ── transcribeAudio() ────▶ │                           │
   │                          │                             │ ── POST /transcriptions ▶│
   │                          │                             │                      [Whisper]
   │                          │                             │ ◀── { text: "..." } ──── │
   │                          │ ◀── texto transcrito ────── │                           │
   │                          │                             │                           │
   │                          │ ── processText() ────────▶ │                           │
   │                          │                             │ ── POST /messages ──────▶│
   │                          │                             │                      [Claude]
   │                          │                             │ ◀── texto corregido ──── │
   │                          │ ◀── texto final ─────────── │                           │
   │                          │                             │                           │
   │                          │ ── pasteText() ──────────▶ │                           │
   │                          │                             │ clipboard.writeText()    │
   │                          │                             │ mainWindow.hide()        │
   │                          │                             │ SendKeys("^v")           │
   │ ◀═══════════════════════════════════════ TEXTO PEGADO │                           │
   │                          │                             │                           │
   │                          │ ── saveTranscription() ──▶ │                           │
   │                          │                             │ db.run(INSERT...)        │
   │                          │                             │                           │
```

---

## 5. Los Archivos y Su Propósito

### Estructura de Archivos

```
murmullo/
│
├── main.js              ← 🧠 El cerebro (proceso principal de Electron)
├── preload.js           ← 🌉 El puente seguro (IPC bridge)
├── index.html           ← 📄 Página HTML raíz
├── vite.config.js       ← ⚙️ Configuración del bundler
├── package.json         ← 📦 Dependencias y scripts
├── .env                 ← 🔑 API keys (secreto!)
│
└── src/
    ├── main.jsx         ← 🚪 Punto de entrada de React (router)
    ├── App.jsx          ← 🎙️ Ventana de grabación (la principal)
    ├── ControlPanel.jsx ← ⚙️ Panel de configuración
    └── styles/
        └── globals.css  ← 🎨 Estilos globales (Tailwind)
```

### Detalle de Cada Archivo

#### **main.js** (958 líneas) - El Cerebro

Este archivo controla TODO lo que pasa "detrás de escenas":

| Líneas | Responsabilidad |
|--------|-----------------|
| 1-50 | Imports y configuración inicial |
| 51-150 | Logging system (escritura de logs) |
| 151-280 | Creación de ventanas (main + control panel) |
| 281-310 | Registro de hotkeys globales |
| 311-450 | IPC Handler: transcribe-audio (Whisper) |
| 451-550 | IPC Handler: process-text (Claude/GPT) |
| 551-650 | IPC Handler: paste-text (clipboard + SendKeys) |
| 651-750 | IPC Handlers: database (save, get transcriptions) |
| 751-850 | IPC Handlers: settings, logs, tray |
| 851-958 | App lifecycle (ready, quit, etc.) |

#### **preload.js** (45 líneas) - El Puente

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Cada función aquí es un "permiso" que le das al renderer
  transcribeAudio: (data, opts) => ipcRenderer.invoke('transcribe-audio', data, opts),
  processText: (text, opts) => ipcRenderer.invoke('process-text', text, opts),
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, val) => ipcRenderer.invoke('set-setting', key, val),
  onToggleDictation: (callback) => ipcRenderer.on('toggle-dictation', callback),
  // ... etc
});
```

#### **src/App.jsx** (314 líneas) - Ventana de Grabación

Esta es la interfaz principal que ves cuando usas la app:

| Sección | Propósito |
|---------|-----------|
| Estados | `IDLE`, `RECORDING`, `PROCESSING`, `SUCCESS`, `ERROR` |
| startRecording() | Pide permiso al mic, crea MediaRecorder |
| stopRecording() | Detiene grabación, procesa audio |
| processAudio() | Flujo completo: Whisper → Claude → Pegar |
| Render | Botón circular que cambia según estado |

#### **src/ControlPanel.jsx** (956 líneas) - Panel de Configuración

Tiene 7 pestañas:

1. **GENERAL**: Idioma, modo (fast/smart), proveedor IA
2. **API_KEYS**: Campos para OpenAI y Anthropic keys
3. **HOTKEY**: Muestra el atajo actual
4. **HISTORY**: Lista de transcripciones pasadas
5. **STATS**: Estadísticas de uso y costos estimados
6. **LOGS**: Ver y exportar logs de la aplicación
7. **HELP**: Información sobre precios y uso

---

## 6. Comunicación Entre Procesos (IPC)

### ¿Qué es IPC?

**IPC** = Inter-Process Communication (Comunicación Entre Procesos)

Como el renderer (React) no puede hacer ciertas cosas directamente (llamar APIs, acceder archivos), tiene que "pedirle" al main process que lo haga. IPC es ese sistema de "pedidos".

### Tipos de IPC en Electron

```javascript
// TIPO 1: send/on (fuego y olvida, no espera respuesta)
// Main → Renderer
mainWindow.webContents.send('toggle-dictation');
// Renderer escucha:
ipcRenderer.on('toggle-dictation', callback);

// TIPO 2: invoke/handle (pide y espera respuesta)
// Renderer → Main
const result = await ipcRenderer.invoke('transcribe-audio', data);
// Main responde:
ipcMain.handle('transcribe-audio', async (event, data) => {
  // ... hacer algo ...
  return resultado;  // Esto llega al renderer
});
```

### Todos los Canales IPC de Murmullo

| Canal | Dirección | Propósito |
|-------|-----------|-----------|
| `toggle-dictation` | Main → Renderer | Notifica que se presionó el hotkey |
| `transcribe-audio` | Renderer → Main | Envía audio para transcribir |
| `process-text` | Renderer → Main | Envía texto para corregir con IA |
| `paste-text` | Renderer → Main | Pega texto en la app activa |
| `save-transcription` | Renderer → Main | Guarda en base de datos |
| `get-transcriptions` | Renderer → Main | Obtiene historial |
| `get-setting` | Renderer → Main | Lee configuración |
| `set-setting` | Renderer → Main | Guarda configuración |
| `show-control-panel` | Renderer → Main | Muestra ventana de settings |
| `get-api-keys` | Renderer → Main | Obtiene keys del .env |

---

## 7. Las APIs Externas

### OpenAI Whisper (Speech-to-Text)

**¿Qué hace?**: Convierte audio a texto

**Endpoint**: `POST https://api.openai.com/v1/audio/transcriptions`

**Costo**: $0.006 USD por minuto de audio (~$0.36/hora)

```javascript
// Ejemplo de llamada
const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-xxx'
  },
  body: formData  // Contiene el archivo de audio
});

const { text } = await response.json();
// text = "haz un commit al branch main"
```

### Anthropic Claude (Corrección)

**¿Qué hace?**: Corrige gramática, preserva términos técnicos

**Endpoint**: `POST https://api.anthropic.com/v1/messages`

**Costo**: $0.25/millón tokens entrada, $1.25/millón tokens salida (Haiku)

```javascript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': 'sk-ant-xxx',
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    system: 'Eres un corrector de transcripciones...',
    messages: [{ role: 'user', content: textoOriginal }]
  })
});

const { content } = await response.json();
// content[0].text = texto corregido
```

### OpenAI GPT (Alternativa)

**¿Qué hace?**: Lo mismo que Claude, alternativa

**Endpoint**: `POST https://api.openai.com/v1/chat/completions`

**Costo**: $0.15/millón tokens entrada, $0.60/millón salida (GPT-4o-mini)

---

## 8. Almacenamiento de Datos

### Base de Datos SQLite

**Ubicación**: `%APPDATA%/murmullo/murmullo.db`

**Tecnología**: sql.js (SQLite compilado a WebAssembly, corre en memoria)

**Esquema**:

```sql
CREATE TABLE transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_text TEXT NOT NULL,      -- Lo que dijo Whisper
  processed_text TEXT,               -- Lo que corrigió Claude/GPT
  is_processed INTEGER DEFAULT 0,    -- 0=fast, 1=smart
  processing_method TEXT DEFAULT 'none',  -- 'anthropic', 'openai', 'none'
  agent_name TEXT,
  error TEXT
);
```

**Flujo**:

1. App inicia → Cargar archivo de disco a memoria
2. Usuario transcribe → INSERT en memoria
3. Después de cada INSERT → Guardar memoria a disco

### LocalStorage (Configuración)

Para settings simples, usamos localStorage del navegador (en el renderer):

```javascript
// Guardar
localStorage.setItem('language', 'es');
localStorage.setItem('processingMode', 'smart');

// Leer
const language = localStorage.getItem('language') || 'es';
```

**Keys usadas**:

- `language`: 'es' | 'en' | 'auto'
- `processingMode`: 'fast' | 'smart'
- `reasoningProvider`: 'anthropic' | 'openai'
- `reasoningModel`: ID del modelo
- `openaiKey`: API key
- `anthropicKey`: API key

### Sistema de Logs

**Ubicación**: `%APPDATA%/murmullo/logs/`

**Formato**: Un archivo por día (`murmullo-2026-01-21.log`)

**Contenido** (no sensible):

```
[SESSION START] 2026-01-21T10:30:00.000Z
App Version: 1.1.0
Platform: win32

[10:30:15.123] [INFO] App ready
[10:32:45.789] [ACTION] TRANSCRIPTION_COMPLETE { wordCount: 42, latencyMs: 1234 }
```

---

## 9. Conceptos Clave para Recordar

### 1. Separación Main/Renderer

- **Main**: Node.js completo, acceso al sistema
- **Renderer**: Navegador sandboxeado, solo web APIs
- **Comunicación**: Solo vía IPC

### 2. Flujo de Datos

```
Voz → MediaRecorder → IPC → Whisper API → IPC → Claude API → IPC → Clipboard → SendKeys
```

### 3. Seguridad

- Context Isolation activado
- Node Integration desactivado
- preload.js como único puente
- API keys en .env (no en código)

### 4. Persistencia

- **Configuración**: localStorage (volátil, por usuario)
- **Transcripciones**: SQLite (persistente, en AppData)
- **Logs**: Archivos de texto (para debugging)

### 5. APIs y Costos

- **Whisper**: $0.006/min para transcribir
- **Claude Haiku**: ~$0.001 por transcripción corta
- **Total estimado**: ~$0.10 USD por hora de uso activo

---

## Diagrama Final de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MURMULLO v1.1.0                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ELECTRON MAIN PROCESS                            │   │
│  │                          (main.js)                                   │   │
│  │                                                                      │   │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │   │ Windows  │  │ Hotkeys  │  │ Database │  │ API Calls        │   │   │
│  │   │ Manager  │  │ Manager  │  │ (sql.js) │  │ (Whisper/Claude) │   │   │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  │                                                                      │   │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │   │ Clipboard│  │ Tray     │  │ Logging  │  │ IPC Handlers     │   │   │
│  │   │ Manager  │  │ Manager  │  │ System   │  │ (15+ channels)   │   │   │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│                          preload.js                                         │
│                      (Context Bridge)                                       │
│                                 │                                           │
│  ┌──────────────────────────────┴───────────────────────────────────────┐   │
│  │                     ELECTRON RENDERER PROCESS                         │   │
│  │                          (React + Vite)                               │   │
│  │                                                                       │   │
│  │   ┌─────────────────────┐        ┌────────────────────────────┐      │   │
│  │   │   Main Window       │        │   Control Panel Window     │      │   │
│  │   │   (App.jsx)         │        │   (ControlPanel.jsx)       │      │   │
│  │   │                     │        │                            │      │   │
│  │   │  ┌──────────────┐   │        │  ┌────┬────┬────┬────┐    │      │   │
│  │   │  │ ○ Recording  │   │        │  │Gen │API │Hot │Hist│    │      │   │
│  │   │  │   Button     │   │        │  ├────┴────┴────┴────┤    │      │   │
│  │   │  └──────────────┘   │        │  │     Settings       │    │      │   │
│  │   │                     │        │  │      Forms         │    │      │   │
│  │   │  MediaRecorder API  │        │  └────────────────────┘    │      │   │
│  │   │                     │        │                            │      │   │
│  │   └─────────────────────┘        └────────────────────────────┘      │   │
│  │                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                            EXTERNAL SERVICES                                │
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │  OpenAI Whisper │    │ Anthropic Claude│    │   OpenAI GPT    │        │
│   │  (Speech→Text)  │    │ (Grammar Fix)   │    │ (Alternative)   │        │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Próximos Pasos para Aprender Más

Si quieres profundizar, te recomiendo explorar en este orden:

1. **Lee `main.js`** - Es el archivo más importante, controla todo
2. **Lee `preload.js`** - Es corto y te muestra el patrón de seguridad
3. **Lee `src/App.jsx`** - La máquina de estados y el flujo de grabación
4. **Experimenta** - Agrega `console.log()` en diferentes puntos para ver el flujo
5. **Lee la documentación de Electron** - https://www.electronjs.org/docs

---

*Documento generado el 2026-01-21 para el proyecto Murmullo v1.1.0*

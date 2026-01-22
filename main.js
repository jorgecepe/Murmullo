const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

// DEBUG MODE - set to true for extensive logging
const DEBUG = true;

// ==========================================
// PERSISTENT LOGGING SYSTEM
// ==========================================
let logFilePath = null;
let logStream = null;

function initLogging() {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    logFilePath = path.join(logsDir, `murmullo-${today}.log`);

    // Open log file in append mode
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    // Write session start marker
    const sessionStart = `\n${'='.repeat(60)}\n[SESSION START] ${new Date().toISOString()}\nApp Version: ${app.getVersion()}\nPlatform: ${process.platform}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\n${'='.repeat(60)}\n`;
    logStream.write(sessionStart);

    console.log('[MURMULLO] Log file initialized:', logFilePath);
  } catch (err) {
    console.error('[MURMULLO] Failed to initialize logging:', err);
  }
}

function writeToLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  const logLine = `[${timestamp}] [${level}] ${message}\n`;

  // Write to file if stream is available
  if (logStream) {
    logStream.write(logLine);
  }

  return logLine;
}

function log(...args) {
  if (DEBUG) {
    const logLine = writeToLog('DEBUG', ...args);
    console.log('[MURMULLO DEBUG]', new Date().toISOString(), ...args);
  }
}

function logError(...args) {
  writeToLog('ERROR', ...args);
  console.error('[MURMULLO ERROR]', new Date().toISOString(), ...args);
}

function logInfo(...args) {
  writeToLog('INFO', ...args);
  console.log('[MURMULLO INFO]', new Date().toISOString(), ...args);
}

// Log user actions for analytics (non-sensitive data only)
function logAction(action, details = {}) {
  writeToLog('ACTION', action, details);
}

// Lightweight list formatting - adds line breaks to numbered lists
function formatNumberedLists(text) {
  // Detect if text contains a numbered list pattern (at least 2 items)
  // Pattern: "1. something 2. something" or "1) something 2) something"
  const hasNumberedList = /\b[1-2][\.\)]\s+\S/.test(text) && /\b[2-9][\.\)]\s+\S/.test(text);

  if (!hasNumberedList) {
    return text; // No list detected, return as-is
  }

  // Add line break before each numbered item (except the first one)
  // This handles: "1. item 2. item 3. item" -> "1. item\n2. item\n3. item"
  let formatted = text.replace(/\s+([2-9]|[1-9]\d+)[\.\)]\s+/g, '\n$1. ');

  // Also handle if list starts mid-sentence: add line break before "1."
  // Look for pattern like "are: 1." or "son: 1." or "following 1."
  formatted = formatted.replace(/([:\.])\s*(1[\.\)])\s+/g, '$1\n$2 ');

  log('List formatting applied');
  return formatted;
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let controlPanel = null;
let tray = null;
let db = null;
let dbPath = null;

const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:5174';

// Database setup with sql.js
async function initDatabase() {
  try {
    log('Initializing database...');
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();

    dbPath = path.join(app.getPath('userData'), 'murmullo.db');
    log('Database path:', dbPath);

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      log('Loaded existing database');
    } else {
      db = new SQL.Database();
      log('Created new database');
    }

    // Create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        original_text TEXT NOT NULL,
        processed_text TEXT,
        is_processed INTEGER DEFAULT 0,
        processing_method TEXT DEFAULT 'none',
        agent_name TEXT,
        error TEXT
      )
    `);

    // Try to create index (may already exist)
    try {
      db.run('CREATE INDEX IF NOT EXISTS idx_timestamp ON transcriptions(timestamp DESC)');
    } catch (e) {}

    saveDatabase();
    console.log('Database initialized at:', dbPath);
  } catch (err) {
    logError('Database initialization error:', err);
  }
}

function saveDatabase() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function createMainWindow() {
  log('Creating main window...');
  mainWindow = new BrowserWindow({
    width: 350,
    height: 250,
    frame: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    // Open DevTools in dev mode
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      log('Main window hidden to tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  log('Main window created');
}

function createControlPanel() {
  log('Creating control panel...');
  controlPanel = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    controlPanel.loadURL(`${VITE_DEV_SERVER_URL}#/control-panel`);
  } else {
    controlPanel.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: '/control-panel' });
  }

  controlPanel.on('close', (e) => {
    e.preventDefault();
    controlPanel.hide();
  });

  log('Control panel created');
}

function createTray() {
  log('Creating tray...');

  // Create a simple 16x16 blue circle icon for the tray
  // Using a minimal valid PNG that Windows can display
  const size = { width: 16, height: 16 };
  const trayIcon = nativeImage.createEmpty();

  // Try to resize to ensure it's valid, if empty create from buffer
  const canvas = Buffer.alloc(16 * 16 * 4); // RGBA buffer
  for (let i = 0; i < 16 * 16; i++) {
    const x = i % 16;
    const y = Math.floor(i / 16);
    const dx = x - 8;
    const dy = y - 8;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 6) {
      // Blue circle
      canvas[i * 4] = 59;      // R
      canvas[i * 4 + 1] = 130; // G
      canvas[i * 4 + 2] = 246; // B
      canvas[i * 4 + 3] = 255; // A
    } else {
      // Transparent
      canvas[i * 4] = 0;
      canvas[i * 4 + 1] = 0;
      canvas[i * 4 + 2] = 0;
      canvas[i * 4 + 3] = 0;
    }
  }

  const icon = nativeImage.createFromBuffer(canvas, size);
  tray = new Tray(icon);
  tray.setToolTip('Murmullo - Dictado de voz');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mostrar Murmullo', click: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    }},
    { label: 'Configuración', click: () => {
      if (controlPanel) {
        controlPanel.show();
        controlPanel.focus();
      }
    }},
    { type: 'separator' },
    { label: 'Exportar Logs', click: async () => {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      if (fs.existsSync(logsDir)) {
        shell.openPath(logsDir);
        logAction('LOGS_FOLDER_OPENED_FROM_TRAY');
      }
    }},
    { type: 'separator' },
    { label: 'Salir', click: () => {
      app.isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setToolTip('Murmullo - Dictado por voz (Ctrl+Shift+Space)');
  tray.setContextMenu(contextMenu);

  // Double-click or single click shows the main window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  log('Tray created');
}

function registerHotkey() {
  const hotkey = 'CommandOrControl+Shift+Space';

  const registered = globalShortcut.register(hotkey, () => {
    log('Hotkey pressed!');
    if (mainWindow) {
      mainWindow.webContents.send('toggle-dictation');
      // Use showInactive to not steal focus from the current window
      mainWindow.showInactive();
    }
  });

  if (registered) {
    console.log('Hotkey registered:', hotkey);
  } else {
    logError('Failed to register hotkey:', hotkey);
  }
}

// IPC Handlers
function setupIpcHandlers() {
  log('Setting up IPC handlers...');

  // Transcribe audio
  ipcMain.handle('transcribe-audio', async (event, audioData, options) => {
    log('=== TRANSCRIBE AUDIO START ===');
    log('Audio data length:', audioData?.length || 0);
    log('Options:', JSON.stringify(options || {}));

    try {
      // Get API key from options (sent from renderer's localStorage) or env
      const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
      log('API key present:', !!apiKey);
      log('API key length:', apiKey?.length || 0);
      log('API key prefix:', apiKey?.substring(0, 10) + '...');

      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add it in Settings.');
      }

      if (!audioData || audioData.length === 0) {
        throw new Error('No audio data received');
      }

      // Check minimum audio size (at least 1KB to be valid)
      if (audioData.length < 1000) {
        throw new Error(`Audio data too small (${audioData.length} bytes). Please speak longer.`);
      }

      // LATENCY OPTIMIZATION: Skip FFmpeg, send WebM directly to Whisper API
      // Whisper API supports WebM natively, no need for conversion
      const startTime = Date.now();

      // Create buffer from audio data
      const audioBuffer = Buffer.from(audioData);
      log('Audio buffer size:', audioBuffer.length);

      // Validate WebM header (should start with 0x1A45DFA3 for EBML)
      const headerCheck = audioBuffer.slice(0, 4);
      const headerHex = headerCheck.toString('hex');
      log('Audio header bytes:', headerHex);

      // Check if this is a valid EBML/WebM header
      const isValidEBML = headerHex === '1a45dfa3';

      let uploadFilename;
      let contentType;
      let fileBuffer;

      if (isValidEBML) {
        // Valid WebM - send directly
        uploadFilename = 'audio.webm';
        contentType = 'audio/webm';
        fileBuffer = audioBuffer;
        log('Valid WebM header detected, sending directly to Whisper API');
      } else {
        // Invalid header - the MediaRecorder produced a corrupted file
        // This can happen when the app was closed abruptly during recording
        // or when the audio stream was in an inconsistent state
        logError('Invalid WebM header detected:', headerHex);
        logError('Expected: 1a45dfa3 (EBML signature)');
        logError('This usually means the MediaRecorder was in a corrupted state.');
        logError('Attempting to use FFmpeg to convert/repair the audio...');

        // Try to use FFmpeg to convert the raw audio data to a valid format
        const tempDir = app.getPath('temp');
        const inputPath = path.join(tempDir, `murmullo_input_${Date.now()}.webm`);
        const outputPath = path.join(tempDir, `murmullo_output_${Date.now()}.wav`);

        try {
          // Write the potentially corrupted data to a temp file
          fs.writeFileSync(inputPath, audioBuffer);
          log('Wrote temp input file:', inputPath);

          // Try to find ffmpeg
          let ffmpegPath = 'ffmpeg';
          try {
            let ffmpegStatic = require('ffmpeg-static');
            if (ffmpegStatic) {
              // In production (asar), ffmpeg-static path needs adjustment
              if (app.isPackaged && ffmpegStatic.includes('app.asar')) {
                ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
              } else {
                ffmpegPath = ffmpegStatic;
              }
              log('Using ffmpeg-static:', ffmpegPath);

              // Verify the file exists
              if (!fs.existsSync(ffmpegPath)) {
                log('ffmpeg-static binary not found at:', ffmpegPath, '- falling back to system ffmpeg');
                ffmpegPath = 'ffmpeg';
              }
            }
          } catch (e) {
            log('ffmpeg-static not available, trying system ffmpeg:', e.message);
          }

          // Run FFmpeg to convert to WAV
          await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, [
              '-y',
              '-i', inputPath,
              '-ar', '16000',
              '-ac', '1',
              '-f', 'wav',
              outputPath
            ]);

            let stderr = '';
            ffmpeg.stderr.on('data', (data) => {
              stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
              }
            });

            ffmpeg.on('error', (err) => {
              reject(new Error(`FFmpeg error: ${err.message}. The audio recording may be corrupted. Try restarting the app.`));
            });
          });

          // Read the converted WAV file
          fileBuffer = fs.readFileSync(outputPath);
          uploadFilename = 'audio.wav';
          contentType = 'audio/wav';
          log('FFmpeg conversion successful, WAV size:', fileBuffer.length);

          // Cleanup temp files
          try {
            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);
          } catch (e) {
            // Ignore cleanup errors
          }
        } catch (ffmpegError) {
          // FFmpeg failed - try to cleanup and throw a helpful error
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {}

          logError('FFmpeg conversion failed:', ffmpegError.message);
          throw new Error(
            'El archivo de audio está corrupto (header inválido: ' + headerHex + '). ' +
            'Esto puede ocurrir si la app se cerró durante una grabación. ' +
            'Por favor reinicia la aplicación completamente y vuelve a intentar.'
          );
        }
      }

      // Build multipart form manually (native fetch + form-data package don't work well together)
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const CRLF = '\r\n';

      const parts = [];

      // File part
      parts.push(
        `--${boundary}${CRLF}`,
        `Content-Disposition: form-data; name="file"; filename="${uploadFilename}"${CRLF}`,
        `Content-Type: ${contentType}${CRLF}${CRLF}`
      );
      parts.push(fileBuffer);
      parts.push(CRLF);

      // Model part
      parts.push(
        `--${boundary}${CRLF}`,
        `Content-Disposition: form-data; name="model"${CRLF}${CRLF}`,
        `whisper-1${CRLF}`
      );

      // Language part
      parts.push(
        `--${boundary}${CRLF}`,
        `Content-Disposition: form-data; name="language"${CRLF}${CRLF}`,
        `${options?.language || 'es'}${CRLF}`
      );

      // End boundary
      parts.push(`--${boundary}--${CRLF}`);

      // Combine all parts into a single buffer
      const bodyParts = parts.map(part =>
        Buffer.isBuffer(part) ? part : Buffer.from(part, 'utf-8')
      );
      const bodyBuffer = Buffer.concat(bodyParts);

      log('Sending to Whisper API...', uploadFilename, 'body size:', bodyBuffer.length);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer
      });

      log('Whisper API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        logError('Whisper API error:', errorText);
        throw new Error(`Whisper API error: ${errorText}`);
      }

      const result = await response.json();
      const elapsedTime = Date.now() - startTime;

      // Lightweight list formatting (no AI needed)
      let formattedText = formatNumberedLists(result.text);

      log('=== TRANSCRIBE AUDIO SUCCESS ===');
      log('Transcribed text (original):', result.text);
      log('Transcribed text (formatted):', formattedText);
      log(`Whisper API latency: ${elapsedTime}ms (no FFmpeg conversion)`);

      // Log action for analytics (word count, latency - no personal content)
      logAction('TRANSCRIPTION_COMPLETE', {
        wordCount: formattedText.split(/\s+/).length,
        latencyMs: elapsedTime,
        audioSizeKB: Math.round(audioData.length / 1024),
        listFormatted: formattedText !== result.text
      });

      return { success: true, text: formattedText, latencyMs: elapsedTime };
    } catch (error) {
      logError('=== TRANSCRIBE AUDIO ERROR ===');
      logError('Error:', error.message);
      logError('Stack:', error.stack);
      return { success: false, error: error.message };
    }
  });

  // Process text with AI
  ipcMain.handle('process-text', async (event, text, options) => {
    log('=== PROCESS TEXT START ===');
    log('Text:', text?.substring(0, 100));
    log('Options:', JSON.stringify(options || {}));

    try {
      const provider = options?.provider || 'anthropic';
      let apiKey, endpoint, body;

      const systemPrompt = `Eres un corrector de transcripciones de voz. Tu trabajo es PRESERVAR TODO el contenido y solo hacer correcciones mínimas.

REGLA PRINCIPAL: NO ELIMINES NADA. Todo lo que el usuario dijo debe aparecer en tu respuesta.

CORRECCIONES PERMITIDAS:
- Agregar tildes donde falten
- Agregar puntuación (comas, puntos)
- Mantener términos técnicos en inglés: git, commit, push, pull, API, deploy, etc.

FORMATEO DE LISTAS (solo si hay números explícitos como "1, 2, 3" o "uno, dos, tres"):
- Convierte "1. texto 2. texto 3. texto" en formato de lista con saltos de línea
- PERO mantén el texto que viene ANTES y DESPUÉS de la lista

EJEMPLO:
Input: "Bueno aquí va mi lista 1 manzanas 2 peras 3 uvas y eso sería todo"
Output: "Bueno, aquí va mi lista:
1. Manzanas
2. Peras
3. Uvas
Y eso sería todo."

PROHIBIDO:
- Eliminar oraciones o frases
- Cambiar sinónimos (acá→aquí, solo→solamente)
- Responder preguntas
- Agregar contenido que el usuario no dijo

Output el texto completo corregido, sin comillas.`;

      const aiStartTime = Date.now();

      if (provider === 'anthropic') {
        apiKey = options?.anthropicKey || process.env.ANTHROPIC_API_KEY;
        log('Using Anthropic, API key present:', !!apiKey);

        if (!apiKey) throw new Error('Anthropic API key not configured');

        endpoint = 'https://api.anthropic.com/v1/messages';
        body = {
          model: options?.model || 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }]
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body)
        });

        const aiLatency = Date.now() - aiStartTime;
        log('Anthropic response status:', response.status);
        log(`Claude Haiku latency: ${aiLatency}ms`);

        if (!response.ok) {
          const error = await response.text();
          logError('Anthropic API error:', error);
          throw new Error(`Anthropic API error: ${error}`);
        }

        const result = await response.json();
        const processedText = result.content[0].text;

        // Log comparison for debugging
        log('=== WHISPER vs CLAUDE COMPARISON ===');
        log('WHISPER (original):', text);
        log('CLAUDE (processed):', processedText);
        log('=== END COMPARISON ===');

        // Log action for analytics
        logAction('AI_PROCESSING_COMPLETE', {
          provider: 'anthropic',
          model: options?.model || 'claude-3-haiku-20240307',
          inputWords: text.split(/\s+/).length,
          outputWords: processedText.split(/\s+/).length,
          latencyMs: aiLatency
        });

        return { success: true, text: processedText, latencyMs: aiLatency };

      } else if (provider === 'openai') {
        apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
        log('Using OpenAI, API key present:', !!apiKey);

        if (!apiKey) throw new Error('OpenAI API key not configured');

        endpoint = 'https://api.openai.com/v1/chat/completions';
        body = {
          model: options?.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ]
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        });

        log('OpenAI response status:', response.status);

        if (!response.ok) {
          const error = await response.text();
          logError('OpenAI API error:', error);
          throw new Error(`OpenAI API error: ${error}`);
        }

        const result = await response.json();
        log('OpenAI result:', JSON.stringify(result).substring(0, 200));
        return { success: true, text: result.choices[0].message.content };
      }

      throw new Error(`Unknown provider: ${provider}`);
    } catch (error) {
      logError('Process text error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Paste text (preserves original clipboard content)
  ipcMain.handle('paste-text', async (event, text) => {
    log('Pasting text:', text?.substring(0, 50));
    try {
      // Save current clipboard content to restore later
      const originalClipboard = clipboard.readText();
      const hadOriginalContent = originalClipboard && originalClipboard.length > 0;
      log('Saved original clipboard content:', hadOriginalContent ? `${originalClipboard.length} chars` : 'empty');

      // Write transcription to clipboard temporarily
      clipboard.writeText(text);
      log('Text copied to clipboard (temporary)');

      // Hide Murmullo window to restore focus to the previous window
      if (mainWindow) {
        mainWindow.hide();
        log('Main window hidden to restore focus');
      }

      // Small delay to ensure focus is restored
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate Ctrl+V based on platform
      if (process.platform === 'win32') {
        log('Simulating Ctrl+V on Windows...');
        const ps = spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")'
        ]);

        await new Promise((resolve, reject) => {
          ps.on('close', (code) => {
            log('PowerShell exit code:', code);
            resolve();
          });
          ps.on('error', reject);
        });
      } else if (process.platform === 'darwin') {
        const osascript = spawn('osascript', [
          '-e', 'tell application "System Events" to keystroke "v" using command down'
        ]);

        await new Promise((resolve, reject) => {
          osascript.on('close', resolve);
          osascript.on('error', reject);
        });
      }

      // Wait a bit for paste to complete, then restore original clipboard
      await new Promise(resolve => setTimeout(resolve, 150));

      if (hadOriginalContent) {
        clipboard.writeText(originalClipboard);
        log('Restored original clipboard content');
      } else {
        // Clear clipboard if it was empty before
        clipboard.writeText('');
        log('Cleared clipboard (was empty before)');
      }

      return { success: true };
    } catch (error) {
      logError('Paste error:', error);
      return { success: false, error: error.message };
    }
  });

  // Settings
  ipcMain.handle('get-setting', (event, key) => {
    return null;
  });

  ipcMain.handle('set-setting', (event, key, value) => {
    return true;
  });

  // Database operations
  ipcMain.handle('get-transcriptions', (event, limit = 50) => {
    log('Getting transcriptions, limit:', limit);
    if (!db) return [];
    try {
      const results = db.exec(`SELECT * FROM transcriptions ORDER BY timestamp DESC LIMIT ${limit}`);
      if (results.length === 0) return [];

      const columns = results[0].columns;
      const data = results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
      log('Found', data.length, 'transcriptions');
      return data;
    } catch (error) {
      logError('Database query error:', error);
      return [];
    }
  });

  ipcMain.handle('save-transcription', (event, data) => {
    log('Saving transcription:', data?.original_text?.substring(0, 50));
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      const timestamp = new Date().toISOString();
      db.run(
        `INSERT INTO transcriptions (timestamp, original_text, processed_text, is_processed, processing_method)
         VALUES (?, ?, ?, ?, ?)`,
        [timestamp, data.original_text, data.processed_text || null, data.is_processed ? 1 : 0, data.processing_method || 'none']
      );

      saveDatabase();

      // Get last insert id
      const result = db.exec('SELECT last_insert_rowid()');
      const id = result[0]?.values[0]?.[0];

      log('Transcription saved with ID:', id);
      return { success: true, id };
    } catch (error) {
      logError('Database insert error:', error);
      return { success: false, error: error.message };
    }
  });

  // Control panel
  ipcMain.handle('show-control-panel', () => {
    log('Showing control panel');
    controlPanel?.show();
  });

  ipcMain.handle('hide-control-panel', () => {
    log('Hiding control panel');
    controlPanel?.hide();
  });

  // API Keys - return from env
  ipcMain.handle('get-api-keys', () => {
    log('Getting API keys from env');
    return {
      openai: process.env.OPENAI_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || ''
    };
  });

  // ==========================================
  // LOG EXPORT HANDLERS
  // ==========================================

  // Get logs directory path
  ipcMain.handle('get-logs-path', () => {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    log('Logs directory:', logsDir);
    return logsDir;
  });

  // List all log files
  ipcMain.handle('list-log-files', () => {
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logsDir)) return [];

      const files = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const filePath = path.join(logsDir, f);
          const stats = fs.statSync(filePath);
          return {
            name: f,
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));

      log('Found log files:', files.length);
      return files;
    } catch (error) {
      logError('Error listing log files:', error);
      return [];
    }
  });

  // Read log file content
  ipcMain.handle('read-log-file', (event, filename) => {
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      const filePath = path.join(logsDir, filename);

      // Security check: ensure file is within logs directory
      if (!filePath.startsWith(logsDir)) {
        throw new Error('Invalid file path');
      }

      if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      log('Read log file:', filename, 'size:', content.length);
      return { success: true, content };
    } catch (error) {
      logError('Error reading log file:', error);
      return { success: false, error: error.message };
    }
  });

  // Export logs to a user-selected location
  ipcMain.handle('export-logs', async () => {
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logsDir)) {
        return { success: false, error: 'No logs directory found' };
      }

      // Open save dialog
      const result = await dialog.showSaveDialog({
        title: 'Export Murmullo Logs',
        defaultPath: `murmullo-logs-${new Date().toISOString().split('T')[0]}.txt`,
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled) {
        return { success: false, error: 'Export cancelled' };
      }

      // Concatenate all log files
      const logFiles = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .sort();

      let combinedLogs = `Murmullo Logs Export\nExported: ${new Date().toISOString()}\nApp Version: ${app.getVersion()}\n${'='.repeat(60)}\n\n`;

      for (const file of logFiles) {
        const filePath = path.join(logsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        combinedLogs += `\n--- ${file} ---\n${content}\n`;
      }

      fs.writeFileSync(result.filePath, combinedLogs, 'utf-8');
      logAction('LOGS_EXPORTED', { path: result.filePath, fileCount: logFiles.length });

      return { success: true, path: result.filePath };
    } catch (error) {
      logError('Error exporting logs:', error);
      return { success: false, error: error.message };
    }
  });

  // Open logs folder in file explorer
  ipcMain.handle('open-logs-folder', () => {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    shell.openPath(logsDir);
    logAction('LOGS_FOLDER_OPENED');
    return { success: true, path: logsDir };
  });

  // Clear old logs (keep last N days)
  ipcMain.handle('clear-old-logs', (event, keepDays = 30) => {
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logsDir)) return { success: true, deleted: 0 };

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - keepDays);

      const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          deletedCount++;
          log('Deleted old log:', file);
        }
      }

      logAction('OLD_LOGS_CLEARED', { keepDays, deleted: deletedCount });
      return { success: true, deleted: deletedCount };
    } catch (error) {
      logError('Error clearing old logs:', error);
      return { success: false, error: error.message };
    }
  });

  log('IPC handlers set up');
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    // Initialize logging first
    initLogging();
    logInfo('App ready, starting initialization...');

    // Load .env file if exists
    const envPath = path.join(__dirname, '.env');
    log('Looking for .env at:', envPath);

    if (fs.existsSync(envPath)) {
      log('.env file found, loading...');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        // Skip comments and empty lines
        if (line.startsWith('#') || !line.trim()) return;

        const equalIndex = line.indexOf('=');
        if (equalIndex > 0) {
          const key = line.substring(0, equalIndex).trim();
          const value = line.substring(equalIndex + 1).trim();
          if (key && value) {
            process.env[key] = value;
            log(`Loaded env: ${key}=${value.substring(0, 10)}...`);
          }
        }
      });
    } else {
      log('.env file not found');
    }

    log('OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
    log('ANTHROPIC_API_KEY loaded:', !!process.env.ANTHROPIC_API_KEY);

    await initDatabase();
    createMainWindow();
    createControlPanel();
    createTray();
    registerHotkey();
    setupIpcHandlers();

    log('Initialization complete');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  } catch (err) {
    logError('FATAL: App initialization failed:', err);
    console.error('FATAL ERROR:', err);
  }
}).catch(err => {
  console.error('FATAL ERROR in app.whenReady:', err);
});

app.on('window-all-closed', () => {
  // Don't quit on window close - we minimize to tray instead
  // The app will only quit when user selects "Salir" from tray menu
  // or when app.isQuitting is true
  if (app.isQuitting) {
    app.quit();
  }
  // Otherwise, keep the app running in the tray
});

app.on('will-quit', () => {
  log('App quitting...');
  globalShortcut.unregisterAll();
  saveDatabase();

  // Destroy tray icon
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('second-instance', () => {
  // When user tries to open a second instance, show and focus the existing window
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

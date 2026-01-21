const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

// DEBUG MODE - set to true for extensive logging
const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    console.log('[MURMULLO DEBUG]', new Date().toISOString(), ...args);
  }
}

function logError(...args) {
  console.error('[MURMULLO ERROR]', new Date().toISOString(), ...args);
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
  const iconPath = path.join(__dirname, 'resources', 'tray-icon.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple 16x16 icon programmatically
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Murmullo', click: () => mainWindow?.show() },
    { label: 'Settings', click: () => controlPanel?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      app.isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setToolTip('Murmullo - Voice Dictation');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
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

      // Use system temp dir with short path to avoid spaces issues
      const os = require('os');
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      const tempAudioPath = path.join(tempDir, `mur_${timestamp}.webm`);
      const tempWavPath = path.join(tempDir, `mur_${timestamp}.wav`);

      log('Temp dir:', tempDir);
      log('Temp audio path:', tempAudioPath);
      log('Temp WAV path:', tempWavPath);

      // Write audio data to file
      const audioBuffer = Buffer.from(audioData);
      log('Audio buffer size:', audioBuffer.length);
      fs.writeFileSync(tempAudioPath, audioBuffer);
      const audioFileSize = fs.statSync(tempAudioPath).size;
      log('Audio file written, size:', audioFileSize);

      // Validate WebM header (should start with 0x1A45DFA3 for EBML)
      const headerCheck = audioBuffer.slice(0, 4);
      log('Audio header bytes:', headerCheck.toString('hex'));

      // Get ffmpeg path - handle asar packaging
      let ffmpegPath;
      try {
        ffmpegPath = require('ffmpeg-static');
        // Handle asar unpacking for production
        if (ffmpegPath.includes('app.asar')) {
          ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
        }
        log('FFmpeg path:', ffmpegPath);
      } catch (e) {
        logError('Failed to get ffmpeg-static path:', e);
        throw new Error('FFmpeg not available');
      }

      // Verify ffmpeg exists
      if (!fs.existsSync(ffmpegPath)) {
        logError('FFmpeg binary not found at:', ffmpegPath);
        throw new Error(`FFmpeg binary not found at: ${ffmpegPath}`);
      }
      log('FFmpeg binary exists: true');

      // Convert to WAV using ffmpeg with explicit input format
      log('Starting FFmpeg conversion...');
      let ffmpegSuccess = false;
      let ffmpegError = '';

      try {
        await new Promise((resolve, reject) => {
          const args = [
            '-y',                    // Overwrite output
            // Let FFmpeg auto-detect input format (don't force -f webm)
            '-i', tempAudioPath,    // Input file
            '-vn',                  // No video
            '-ar', '16000',         // Sample rate
            '-ac', '1',             // Mono
            '-c:a', 'pcm_s16le',    // PCM format
            tempWavPath             // Output file
          ];
          log('FFmpeg args:', args.join(' '));

          const ffmpeg = spawn(ffmpegPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
          });

          let stderr = '';
          let stdout = '';

          ffmpeg.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          ffmpeg.on('close', (code) => {
            log('FFmpeg exit code:', code);
            if (stderr) {
              log('FFmpeg stderr (last 500 chars):', stderr.slice(-500));
            }
            if (code === 0) {
              log('FFmpeg conversion successful');
              ffmpegSuccess = true;
              resolve();
            } else {
              ffmpegError = stderr.slice(-300);
              logError('FFmpeg failed with code:', code);
              reject(new Error(`FFmpeg exited with code ${code}`));
            }
          });

          ffmpeg.on('error', (err) => {
            logError('FFmpeg spawn error:', err);
            reject(err);
          });

          // Set timeout for FFmpeg (30 seconds)
          setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error('FFmpeg conversion timeout'));
          }, 30000);
        });
      } catch (ffmpegErr) {
        log('FFmpeg failed, attempting direct upload...');
        ffmpegError = ffmpegErr.message;
      }

      // Use converted WAV if available, otherwise try direct upload
      let uploadPath, uploadFilename, contentType;
      if (ffmpegSuccess && fs.existsSync(tempWavPath)) {
        const wavSize = fs.statSync(tempWavPath).size;
        log('WAV file created, size:', wavSize);
        uploadPath = tempWavPath;
        uploadFilename = 'audio.wav';
        contentType = 'audio/wav';
      } else {
        // Fallback: try uploading the webm directly (Whisper supports it)
        log('Using original WebM file for upload (FFmpeg failed)');
        uploadPath = tempAudioPath;
        uploadFilename = 'audio.webm';
        contentType = 'audio/webm';
      }

      // Read file as buffer for multipart upload
      const fileBuffer = fs.readFileSync(uploadPath);
      log('File buffer size:', fileBuffer.length);

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
      log('Whisper API result:', JSON.stringify(result));

      // Cleanup temp files
      try {
        if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
        if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
        log('Temp files cleaned up');
      } catch (e) {
        log('Cleanup warning:', e.message);
      }

      log('=== TRANSCRIBE AUDIO SUCCESS ===');
      log('Transcribed text:', result.text);
      return { success: true, text: result.text };
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

      const systemPrompt = `Eres un asistente de post-procesamiento para dictado de voz en español técnico.
Tu trabajo es:
1. Corregir errores de transcripción y gramática en español
2. MANTENER términos técnicos en inglés: git, commit, push, pull, merge, branch, API, deploy, build, test, debug, refactor, endpoint, frontend, backend, framework, library, runtime, SQL, query, database, schema, migration, JavaScript, TypeScript, Python, React, Node.js, Docker, npm, yarn, webpack, vite, eslint, CI/CD
3. Agregar puntuación apropiada
4. NO traducir nombres de comandos, funciones, o tecnologías
5. Output SOLO el texto corregido sin explicaciones`;

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

        log('Anthropic response status:', response.status);

        if (!response.ok) {
          const error = await response.text();
          logError('Anthropic API error:', error);
          throw new Error(`Anthropic API error: ${error}`);
        }

        const result = await response.json();
        log('Anthropic result:', JSON.stringify(result).substring(0, 200));
        return { success: true, text: result.content[0].text };

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

  // Paste text
  ipcMain.handle('paste-text', async (event, text) => {
    log('Pasting text:', text?.substring(0, 50));
    try {
      clipboard.writeText(text);
      log('Text copied to clipboard');

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

  log('IPC handlers set up');
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    log('App ready, starting initialization...');

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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  log('App quitting...');
  globalShortcut.unregisterAll();
  saveDatabase();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

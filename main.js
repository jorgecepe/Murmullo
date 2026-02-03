const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage, shell, dialog, safeStorage, session } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const SecureStorage = require('./secureStorage');
const { validateIpcMessage, sanitizeString } = require('./ipcValidation');
const { autoUpdater } = require('electron-updater');

// DEBUG MODE - set to true for extensive logging
const DEBUG = true;
// SAVE_DEBUG_AUDIO - set to true to save audio files for testing (saves to %APPDATA%/murmullo/debug_audio/)
const SAVE_DEBUG_AUDIO = false;

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
// Supports both numeric (1, 2, 3) and Spanish word numbers (uno, dos, tres)
function formatNumberedLists(text) {
  // Spanish number words to digits mapping
  const spanishNumbers = {
    'uno': '1', 'una': '1', 'primero': '1', 'primera': '1',
    'dos': '2', 'segundo': '2', 'segunda': '2',
    'tres': '3', 'tercero': '3', 'tercera': '3',
    'cuatro': '4', 'cuarto': '4', 'cuarta': '4',
    'cinco': '5', 'quinto': '5', 'quinta': '5',
    'seis': '6', 'sexto': '6', 'sexta': '6',
    'siete': '7', 'séptimo': '7', 'séptima': '7',
    'ocho': '8', 'octavo': '8', 'octava': '8',
    'nueve': '9', 'noveno': '9', 'novena': '9',
    'diez': '10', 'décimo': '10', 'décima': '10'
  };

  let formatted = text;

  // First, convert Spanish number words to digits when they appear as list markers
  // Pattern: "uno, algo" or "uno: algo" or "uno. algo" at word boundaries
  const spanishPatternStr = `\\b(${Object.keys(spanishNumbers).join('|')})[,:\\.]\\s+`;

  // Check if text contains Spanish number words that look like a list (need at least 2)
  const hasSpanishList = (text.match(new RegExp(spanishPatternStr, 'gi')) || []).length >= 2;

  if (hasSpanishList) {
    // Convert Spanish numbers to digits with proper list format
    formatted = formatted.replace(
      new RegExp(spanishPatternStr, 'gi'),
      (match, word) => {
        const digit = spanishNumbers[word.toLowerCase()];
        return digit + '. ';
      }
    );
    log('Spanish number words converted to digits');
  }

  // Now check for numeric list pattern (at least 2 items)
  // Pattern: "1. something 2. something" or "1) something 2) something"
  const hasNumberedList = /\b[1-2][\.\)]\s+\S/.test(formatted) && /\b[2-9][\.\)]\s+\S/.test(formatted);

  if (!hasNumberedList && !hasSpanishList) {
    return text; // No list detected, return original
  }

  // Add line break before each numbered item (except the first one)
  // This handles: "1. item 2. item 3. item" -> "1. item\n2. item\n3. item"
  formatted = formatted.replace(/\s+([2-9]|[1-9]\d+)[\.\)]\s+/g, '\n$1. ');

  // Also handle if list starts mid-sentence: add line break before "1."
  // Look for pattern like "siguiente: 1." or "son: 1." or "hacer: 1."
  formatted = formatted.replace(/([:\.])\s*(1[\.\)])\s+/g, '$1\n$2 ');

  log('List formatting applied');
  return formatted;
}

// Helper function to mask API keys for display
function maskApiKey(key) {
  if (!key || key.length < 10) return key ? '****' : '';
  const prefix = key.substring(0, 7);
  const suffix = key.substring(key.length - 4);
  return `${prefix}...${suffix}`;
}

// ==========================================
// CONTENT SECURITY POLICY
// ==========================================
function setupContentSecurityPolicy() {
  // Define CSP based on environment
  const cspDirectives = [
    "default-src 'self'",
    // Scripts: self only in production, allow unsafe-eval in dev for hot reload
    isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    // Styles: allow inline for Tailwind CSS
    "style-src 'self' 'unsafe-inline'",
    // Images: self and data URIs (for inline icons)
    "img-src 'self' data: blob:",
    // Fonts: self only
    "font-src 'self'",
    // Connections: self + API endpoints + Murmullo backend
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://murmullo-api.onrender.com" + (isDev ? " ws://localhost:* http://localhost:*" : ""),
    // Media: self for audio recording
    "media-src 'self' blob:",
    // Workers: self
    "worker-src 'self' blob:",
    // Child/Frame: none (no iframes)
    "child-src 'none'",
    "frame-src 'none'",
    // Object: none (no plugins)
    "object-src 'none'",
    // Base URI: self
    "base-uri 'self'",
    // Form action: self
    "form-action 'self'"
  ];

  const csp = cspDirectives.join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  log('Content Security Policy configured');
  log('CSP:', csp);
}

// Prevent multiple instances - MUST be at the top before any other logic
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance is running, quitting...');
  app.quit();
  process.exit(0); // Force immediate exit
}

// Auto-updater state
let updateAvailable = false;
let updateDownloaded = false;
let updateInfo = null;
let downloadProgress = 0;

let mainWindow = null;
let controlPanel = null;
let tray = null;
let db = null;
let dbPath = null;
let currentHotkey = 'CommandOrControl+Shift+Space'; // Default hotkey, can be changed by user
let secureStorage = null; // Initialized after app is ready

// Backend mode settings
let backendMode = false;
let backendUrl = 'http://localhost:3000';
let backendAccessToken = null;
let backendRefreshToken = null;

// ==========================================
// BACKEND API HELPERS
// ==========================================

// Load backend settings from config file
function loadBackendSettings() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      backendMode = config.backendMode || false;
      backendUrl = config.backendUrl || 'http://localhost:3000';
      backendAccessToken = config.backendAccessToken || null;
      backendRefreshToken = config.backendRefreshToken || null;
      log('Backend settings loaded:', { backendMode, backendUrl, hasToken: !!backendAccessToken });
    }
  } catch (err) {
    log('No backend settings found, using defaults');
  }
}

// Save backend settings to config file
function saveBackendSettings() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    config.backendMode = backendMode;
    config.backendUrl = backendUrl;
    config.backendAccessToken = backendAccessToken;
    config.backendRefreshToken = backendRefreshToken;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log('Backend settings saved');
  } catch (err) {
    logError('Failed to save backend settings:', err);
  }
}

// Fetch with automatic retry for network errors
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // Don't retry for client errors (4xx), only for server errors (5xx) or network issues
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      // Server error (5xx) - will retry
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
        log(`Server error ${response.status}, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        log(`Network error, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Make authenticated request to backend
async function backendRequest(endpoint, options = {}) {
  const url = `${backendUrl}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (backendAccessToken) {
    headers['Authorization'] = `Bearer ${backendAccessToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Handle 401 - try to refresh token
    if (response.status === 401 && backendRefreshToken) {
      const refreshed = await refreshBackendToken();
      if (refreshed) {
        // Retry with new token
        headers['Authorization'] = `Bearer ${backendAccessToken}`;
        const retryResponse = await fetch(url, { ...options, headers });
        return handleBackendResponse(retryResponse);
      }
    }

    return handleBackendResponse(response);
  } catch (error) {
    logError('Backend request failed:', error.message);
    throw new Error(`Backend error: ${error.message}`);
  }
}

// Handle backend API response
async function handleBackendResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Refresh backend access token
async function refreshBackendToken() {
  try {
    const response = await fetch(`${backendUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: backendRefreshToken })
    });

    if (!response.ok) {
      backendAccessToken = null;
      backendRefreshToken = null;
      saveBackendSettings();
      return false;
    }

    const data = await response.json();
    backendAccessToken = data.tokens.accessToken;
    backendRefreshToken = data.tokens.refreshToken;
    saveBackendSettings();
    return true;
  } catch (error) {
    backendAccessToken = null;
    backendRefreshToken = null;
    saveBackendSettings();
    return false;
  }
}

// Transcribe via backend
async function transcribeViaBackend(audioData, options = {}) {
  log('Transcribing via backend...');

  // Convert to base64
  const base64Audio = Buffer.from(audioData).toString('base64');

  const data = await backendRequest('/api/v1/transcription', {
    method: 'POST',
    body: JSON.stringify({
      audio: base64Audio,
      language: options.language || 'es',
      model: 'whisper-1'
    })
  });

  return data;
}

// Process text via backend
async function processTextViaBackend(text, options = {}) {
  log('Processing text via backend...');

  const data = await backendRequest('/api/v1/ai/process', {
    method: 'POST',
    body: JSON.stringify({
      text,
      provider: options.provider || 'anthropic',
      model: options.model
    })
  });

  return data;
}

// Combined transcribe and process via backend
async function transcribeAndProcessViaBackend(audioData, options = {}) {
  log('Transcribe and process via backend...');

  const base64Audio = Buffer.from(audioData).toString('base64');

  const data = await backendRequest('/api/v1/ai/transcribe-and-process', {
    method: 'POST',
    body: JSON.stringify({
      audio: base64Audio,
      language: options.language || 'es',
      provider: options.provider || 'anthropic',
      skipProcessing: options.skipProcessing || false
    })
  });

  return data;
}

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

  // Get screen dimensions to position window at bottom-right
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Small indicator window (60x60 pixels)
  const windowSize = 60;
  const margin = 20; // Distance from screen edges

  mainWindow = new BrowserWindow({
    width: windowSize,
    height: windowSize,
    x: screenWidth - windowSize - margin,
    y: screenHeight - windowSize - margin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false, // Don't steal focus from other windows
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false
    }
  });

  // Make window click-through when idle (optional - can be enabled later)
  // mainWindow.setIgnoreMouseEvents(true, { forward: true });

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
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false
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
    { label: 'Acerca de Murmullo...', click: () => {
      const appVersion = app.getVersion();
      const info = `Murmullo v${appVersion}\n\nDictado de voz para desarrolladores hispanohablantes.\n\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}\nPlataforma: ${process.platform} (${process.arch})\n\nHotkey: ${currentHotkey || 'Ctrl+Shift+Space'}`;
      dialog.showMessageBox({
        type: 'info',
        title: 'Acerca de Murmullo',
        message: `Murmullo v${appVersion}`,
        detail: `Dictado de voz para desarrolladores hispanohablantes.\n\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}\nPlataforma: ${process.platform} (${process.arch})\n\nHotkey actual: ${currentHotkey || 'Ctrl+Shift+Space'}`,
        buttons: ['OK']
      });
      logAction('ABOUT_DIALOG_SHOWN');
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

function registerHotkey(newHotkey = null) {
  // Unregister previous hotkey if exists
  if (currentHotkey) {
    try {
      globalShortcut.unregister(currentHotkey);
      log('Unregistered previous hotkey:', currentHotkey);
    } catch (e) {
      // Ignore if not registered
    }
  }

  // Use new hotkey or default
  const hotkey = newHotkey || currentHotkey || 'CommandOrControl+Shift+Space';
  currentHotkey = hotkey;

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
    log('Hotkey registered successfully:', hotkey);
    return { success: true, hotkey };
  } else {
    logError('Failed to register hotkey:', hotkey);
    return { success: false, error: `No se pudo registrar el hotkey: ${hotkey}` };
  }
}

// Helper to create validated IPC handler
function createValidatedHandler(channel, handler) {
  return async (event, ...args) => {
    const validation = validateIpcMessage(channel, ...args);
    if (!validation.isValid) {
      logError(`IPC validation failed for ${channel}:`, validation.error);
      return { success: false, error: `Validation error: ${validation.error}` };
    }
    return handler(event, ...args);
  };
}

// ==========================================
// AUTO-UPDATER SETUP
// ==========================================
function setupAutoUpdater() {
  log('Setting up auto-updater...');

  // Configure auto-updater
  autoUpdater.autoDownload = false; // Don't auto-download, let user decide
  autoUpdater.autoInstallOnAppQuit = true;

  // Log auto-updater events
  autoUpdater.logger = {
    info: (msg) => log('[AutoUpdater]', msg),
    warn: (msg) => log('[AutoUpdater WARN]', msg),
    error: (msg) => logError('[AutoUpdater]', msg),
    debug: (msg) => log('[AutoUpdater DEBUG]', msg)
  };

  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates...');
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    log('Update available:', info.version);
    updateAvailable = true;
    updateInfo = info;
    sendUpdateStatus('available', { version: info.version, releaseNotes: info.releaseNotes });
    logAction('UPDATE_AVAILABLE', { version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    log('No update available, current version is up to date');
    updateAvailable = false;
    sendUpdateStatus('not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = Math.round(progress.percent);
    log('Download progress:', downloadProgress + '%');
    sendUpdateStatus('downloading', { percent: downloadProgress, bytesPerSecond: progress.bytesPerSecond });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('Update downloaded:', info.version);
    updateDownloaded = true;
    updateInfo = info;
    sendUpdateStatus('downloaded', { version: info.version });
    logAction('UPDATE_DOWNLOADED', { version: info.version });
  });

  autoUpdater.on('error', (error) => {
    logError('Auto-updater error:', error.message);
    sendUpdateStatus('error', { message: error.message });
  });

  // Check for updates after app is ready (only in production)
  if (!isDev) {
    // Initial check after a short delay
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        log('Update check failed:', err.message);
      });
    }, 5000);

    // Check periodically (every 4 hours)
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => {
        log('Periodic update check failed:', err.message);
      });
    }, 4 * 60 * 60 * 1000);
  } else {
    log('Auto-updater disabled in dev mode');
  }
}

// Send update status to renderer
function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
  if (controlPanel && !controlPanel.isDestroyed()) {
    controlPanel.webContents.send('update-status', { status, ...data });
  }
}

// IPC Handlers
function setupIpcHandlers() {
  log('Setting up IPC handlers...');

  // Transcribe audio
  ipcMain.handle('transcribe-audio', async (event, audioData, options) => {
    // Validate input
    const validation = validateIpcMessage('transcribe-audio', audioData, options);
    if (!validation.isValid) {
      logError('Transcribe validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    log('=== TRANSCRIBE AUDIO START ===');
    log('Audio data length:', audioData?.length || 0);
    log('Options:', JSON.stringify({ language: options?.language }));
    log('Backend mode:', backendMode, 'Has token:', !!backendAccessToken);

    // If backend mode is enabled and user is authenticated, use backend
    if (backendMode && backendAccessToken) {
      try {
        const startTime = Date.now();
        const result = await transcribeViaBackend(audioData, options);
        const elapsedTime = Date.now() - startTime;

        // Apply list formatting
        let formattedText = formatNumberedLists(result.text);

        log('=== BACKEND TRANSCRIBE SUCCESS ===');
        log('Words:', formattedText.split(/\s+/).length, 'chars:', formattedText.length);
        log(`Backend latency: ${elapsedTime}ms`);

        logAction('TRANSCRIPTION_COMPLETE_BACKEND', {
          wordCount: formattedText.split(/\s+/).length,
          latencyMs: elapsedTime,
          audioSizeKB: Math.round(audioData.length / 1024)
        });

        return { success: true, text: formattedText, latencyMs: elapsedTime, viaBackend: true };
      } catch (error) {
        logError('Backend transcription failed:', error.message);
        // If backend fails, we could fall back to local mode, but for now return error
        return { success: false, error: `Backend error: ${error.message}` };
      }
    }

    try {
      // Get API key from secure storage, then options, then env
      const apiKey = secureStorage?.getSecure('openai_api_key') || options?.apiKey || process.env.OPENAI_API_KEY;
      log('API key present:', !!apiKey);
      log('API key length:', apiKey?.length || 0);
      // Don't log API key prefix for security

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


      // Check audio format by header
      const headerCheck = audioBuffer.slice(0, 4);
      const headerHex = headerCheck.toString('hex');
      const headerString = headerCheck.toString('ascii');
      log('Audio header bytes:', headerHex, '(' + headerString + ')');

      // Detect format
      const isValidEBML = headerHex === '1a45dfa3';  // WebM/MKV
      const isWAV = headerString === 'RIFF';         // WAV

      let uploadFilename;
      let contentType;
      let fileBuffer;

      if (isWAV) {
        // WAV format - converted by renderer to avoid Chromium bug
        uploadFilename = 'audio.wav';
        contentType = 'audio/wav';
        fileBuffer = audioBuffer;
        log('WAV format detected (converted from WebM), sending to Whisper API');
      } else if (isValidEBML) {
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

      // Save audio files for testing purposes (with correct extension)
      // Enable SAVE_DEBUG_AUDIO at top of file to capture audio samples
      if (SAVE_DEBUG_AUDIO) {
        try {
          const debugAudioDir = path.join(app.getPath('userData'), 'debug_audio');
          if (!fs.existsSync(debugAudioDir)) {
            fs.mkdirSync(debugAudioDir, { recursive: true });
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const ext = uploadFilename.split('.').pop(); // wav, webm, etc.
          const debugAudioPath = path.join(debugAudioDir, `audio_${timestamp}.${ext}`);
          fs.writeFileSync(debugAudioPath, fileBuffer);
          log('DEBUG: Audio saved to:', debugAudioPath);
        } catch (debugErr) {
          log('DEBUG: Failed to save audio file:', debugErr.message);
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

      const response = await fetchWithRetry('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer
      }, 3); // Retry up to 3 times

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
      log('Transcription complete - words:', formattedText.split(/\s+/).length, 'chars:', formattedText.length);
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
    // Validate input
    const validation = validateIpcMessage('process-text', text, options);
    if (!validation.isValid) {
      logError('Process-text validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    // Sanitize text input
    const sanitizedText = sanitizeString(text, 50000); // Max 50k chars

    log('=== PROCESS TEXT START ===');
    log('Input length:', sanitizedText?.length || 0, 'words:', sanitizedText?.split(/\s+/).length || 0);
    log('Options:', JSON.stringify({ provider: options?.provider, model: options?.model }));
    log('Backend mode:', backendMode, 'Has token:', !!backendAccessToken);

    // If backend mode is enabled and user is authenticated, use backend
    if (backendMode && backendAccessToken) {
      try {
        const startTime = Date.now();
        const result = await processTextViaBackend(sanitizedText, options);
        const aiLatency = Date.now() - startTime;

        log('=== BACKEND PROCESS TEXT SUCCESS ===');
        log('Output words:', result.text.split(/\s+/).length);
        log(`Backend AI latency: ${aiLatency}ms`);

        logAction('AI_PROCESSING_COMPLETE_BACKEND', {
          provider: options?.provider || 'anthropic',
          inputWords: sanitizedText.split(/\s+/).length,
          outputWords: result.text.split(/\s+/).length,
          latencyMs: aiLatency
        });

        return { success: true, text: result.text, latencyMs: aiLatency, viaBackend: true };
      } catch (error) {
        logError('Backend text processing failed:', error.message);
        return { success: false, error: `Backend error: ${error.message}` };
      }
    }

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
        apiKey = secureStorage?.getSecure('anthropic_api_key') || options?.anthropicKey || process.env.ANTHROPIC_API_KEY;
        log('Using Anthropic, API key present:', !!apiKey);

        if (!apiKey) throw new Error('Anthropic API key not configured');

        endpoint = 'https://api.anthropic.com/v1/messages';
        body = {
          model: options?.model || 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: sanitizedText }]
        };

        const response = await fetchWithRetry(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body)
        }, 3);

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

        // Log metadata only (no content for privacy)
        log('AI processing complete - input words:', sanitizedText.split(/\s+/).length, 'output words:', processedText.split(/\s+/).length);

        // Log action for analytics
        logAction('AI_PROCESSING_COMPLETE', {
          provider: 'anthropic',
          model: options?.model || 'claude-3-haiku-20240307',
          inputWords: sanitizedText.split(/\s+/).length,
          outputWords: processedText.split(/\s+/).length,
          latencyMs: aiLatency
        });

        return { success: true, text: processedText, latencyMs: aiLatency };

      } else if (provider === 'openai') {
        apiKey = secureStorage?.getSecure('openai_api_key') || options?.apiKey || process.env.OPENAI_API_KEY;
        log('Using OpenAI, API key present:', !!apiKey);

        if (!apiKey) throw new Error('OpenAI API key not configured');

        endpoint = 'https://api.openai.com/v1/chat/completions';
        body = {
          model: options?.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: sanitizedText }
          ]
        };

        const response = await fetchWithRetry(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        }, 3);

        log('OpenAI response status:', response.status);

        if (!response.ok) {
          const error = await response.text();
          logError('OpenAI API error:', error);
          throw new Error(`OpenAI API error: ${error}`);
        }

        const result = await response.json();
        log('OpenAI processing complete');
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
    // Validate input
    const validation = validateIpcMessage('paste-text', text);
    if (!validation.isValid) {
      logError('Paste-text validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    log('Pasting text - length:', text?.length || 0, 'words:', text?.split(/\s+/).length || 0);
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
    // Validate input
    const validation = validateIpcMessage('save-transcription', data);
    if (!validation.isValid) {
      logError('Save-transcription validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    log('Saving transcription - words:', data?.original_text?.split(/\s+/).length || 0, 'processed:', !!data?.processed_text);
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

  // API Keys - get from secure storage (or env as fallback)
  ipcMain.handle('get-api-keys', () => {
    log('Getting API keys');
    // Try secure storage first, then env as fallback
    const openaiKey = secureStorage?.getSecure('openai_api_key') || process.env.OPENAI_API_KEY || '';
    const anthropicKey = secureStorage?.getSecure('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || '';

    return {
      openai: openaiKey,
      anthropic: anthropicKey,
      // Include masked versions for UI display
      openaiMasked: openaiKey ? maskApiKey(openaiKey) : '',
      anthropicMasked: anthropicKey ? maskApiKey(anthropicKey) : ''
    };
  });

  // Save API key securely
  ipcMain.handle('set-api-key', (event, provider, key) => {
    // Validate input
    const validation = validateIpcMessage('set-api-key', provider, key);
    if (!validation.isValid) {
      logError('Set-api-key validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    log('Setting API key for:', provider);
    if (!secureStorage) {
      logError('Secure storage not initialized');
      return { success: false, error: 'Secure storage not available' };
    }

    try {
      const storageKey = provider === 'openai' ? 'openai_api_key' : 'anthropic_api_key';
      const success = secureStorage.setSecure(storageKey, key);

      if (success) {
        logAction('API_KEY_UPDATED', { provider, hasKey: !!key });
        return { success: true, masked: key ? maskApiKey(key) : '' };
      } else {
        return { success: false, error: 'Failed to save key' };
      }
    } catch (err) {
      logError('Failed to set API key:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Check if encryption is available
  ipcMain.handle('check-encryption', () => {
    return {
      available: secureStorage?.isEncryptionAvailable() || false,
      platform: process.platform
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
    // Validate input - prevents path traversal attacks
    const validation = validateIpcMessage('read-log-file', filename);
    if (!validation.isValid) {
      logError('Read-log-file validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      const filePath = path.join(logsDir, filename);

      // Double-check: ensure file is within logs directory (defense in depth)
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
    // Validate input
    const validation = validateIpcMessage('clear-old-logs', keepDays);
    if (!validation.isValid) {
      logError('Clear-old-logs validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

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

  // App info
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-app-info', () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      hotkey: currentHotkey
    };
  });

  // Hotkey management
  ipcMain.handle('get-hotkey', () => {
    return currentHotkey;
  });

  ipcMain.handle('set-hotkey', (event, newHotkey) => {
    // Validate input using validation module
    const validation = validateIpcMessage('set-hotkey', newHotkey);
    if (!validation.isValid) {
      logError('Set-hotkey validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    log('Setting new hotkey:', newHotkey);

    // Try to register the new hotkey
    const result = registerHotkey(newHotkey);

    if (result.success) {
      // Save to config file
      try {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        let config = {};
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        config.hotkey = newHotkey;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        log('Hotkey saved to config:', newHotkey);
        logAction('HOTKEY_CHANGED', { hotkey: newHotkey });
      } catch (err) {
        logError('Failed to save hotkey config:', err);
      }
    }

    return result;
  });

  ipcMain.handle('get-available-hotkeys', () => {
    // Return some common hotkey suggestions
    return [
      'CommandOrControl+Shift+Space',
      'CommandOrControl+Shift+D',
      'CommandOrControl+Shift+M',
      'CommandOrControl+Alt+Space',
      'Alt+Space',
      'F9',
      'F10',
      'CommandOrControl+`'
    ];
  });

  // ==========================================
  // BACKEND MODE HANDLERS
  // ==========================================

  // Get backend settings
  ipcMain.handle('get-backend-settings', () => {
    return {
      backendMode,
      backendUrl,
      isAuthenticated: !!backendAccessToken
    };
  });

  // Set backend mode
  ipcMain.handle('set-backend-mode', (event, enabled) => {
    log('=== SET BACKEND MODE ===');
    log('Enabled:', enabled);
    backendMode = enabled;
    saveBackendSettings();
    log('Backend mode saved, current state:', { backendMode, backendUrl });
    logAction('BACKEND_MODE_CHANGED', { enabled });
    return { success: true, backendMode };
  });

  // Set backend URL
  ipcMain.handle('set-backend-url', (event, url) => {
    log('=== SET BACKEND URL ===');
    log('URL:', url);
    backendUrl = url;
    saveBackendSettings();
    log('Backend URL saved');
    return { success: true, backendUrl };
  });

  // Check backend health
  ipcMain.handle('check-backend-health', async () => {
    log('Checking backend health at:', backendUrl);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${backendUrl}/health`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      log('Backend health response:', response.ok, response.status);
      return { online: response.ok };
    } catch (error) {
      logError('Backend health check failed:', error.message);
      return { online: false };
    }
  });

  // Backend login
  ipcMain.handle('backend-login', async (event, email, password) => {
    log('Backend login attempt for:', email);
    try {
      const response = await fetch(`${backendUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      backendAccessToken = data.tokens.accessToken;
      backendRefreshToken = data.tokens.refreshToken;
      saveBackendSettings();

      logAction('BACKEND_LOGIN_SUCCESS', { email });
      return { success: true, user: data.user };
    } catch (error) {
      logError('Backend login failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Backend register
  ipcMain.handle('backend-register', async (event, email, password, name) => {
    log('Backend register attempt for:', email);
    try {
      const response = await fetch(`${backendUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      backendAccessToken = data.tokens.accessToken;
      backendRefreshToken = data.tokens.refreshToken;
      saveBackendSettings();

      logAction('BACKEND_REGISTER_SUCCESS', { email });
      return { success: true, user: data.user };
    } catch (error) {
      logError('Backend register failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Backend logout
  ipcMain.handle('backend-logout', async () => {
    log('Backend logout');
    try {
      if (backendAccessToken && backendRefreshToken) {
        await fetch(`${backendUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${backendAccessToken}`
          },
          body: JSON.stringify({ refreshToken: backendRefreshToken })
        });
      }
    } catch (error) {
      // Ignore logout errors
    }

    backendAccessToken = null;
    backendRefreshToken = null;
    saveBackendSettings();

    logAction('BACKEND_LOGOUT');
    return { success: true };
  });

  // Get current user from backend
  ipcMain.handle('backend-get-me', async () => {
    if (!backendAccessToken) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const data = await backendRequest('/api/v1/auth/me');
      return { success: true, user: data.user, limits: data.limits };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get usage from backend
  ipcMain.handle('backend-get-usage', async () => {
    if (!backendAccessToken) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const data = await backendRequest('/api/v1/transcription/usage');
      return { success: true, usage: data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==========================================
  // AUTO-UPDATE HANDLERS
  // ==========================================

  // Get current update status
  ipcMain.handle('get-update-status', () => {
    return {
      updateAvailable,
      updateDownloaded,
      updateInfo: updateInfo ? {
        version: updateInfo.version,
        releaseNotes: updateInfo.releaseNotes,
        releaseDate: updateInfo.releaseDate
      } : null,
      downloadProgress,
      currentVersion: app.getVersion()
    };
  });

  // Check for updates manually
  ipcMain.handle('check-for-updates', async () => {
    log('Manual update check requested');
    if (isDev) {
      return { success: false, error: 'Updates disabled in development mode' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (error) {
      logError('Update check failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Download update
  ipcMain.handle('download-update', async () => {
    log('Download update requested');
    if (!updateAvailable) {
      return { success: false, error: 'No update available' };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      logError('Download update failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Install update and restart
  ipcMain.handle('install-update', () => {
    log('Install update requested');
    if (!updateDownloaded) {
      return { success: false, error: 'Update not downloaded yet' };
    }
    logAction('UPDATE_INSTALLING', { version: updateInfo?.version });
    // This will quit the app and install the update
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  });

  log('IPC handlers set up');
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    // Initialize logging first
    initLogging();
    logInfo('App ready, starting initialization...');

    // Initialize secure storage for API keys
    const secureStoragePath = path.join(app.getPath('userData'), 'secure-keys.json');
    secureStorage = new SecureStorage(secureStoragePath);
    log('Secure storage initialized, encryption available:', secureStorage.isEncryptionAvailable());

    // Setup Content Security Policy
    setupContentSecurityPolicy();

    // Load .env file if exists (for development/migration only)
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

    // Load saved hotkey from config
    try {
      const configPath = path.join(app.getPath('userData'), 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.hotkey) {
          currentHotkey = config.hotkey;
          log('Loaded saved hotkey:', currentHotkey);
        }
      }
    } catch (err) {
      log('No saved config found, using default hotkey');
    }

    // Load backend settings
    loadBackendSettings();

    await initDatabase();
    createMainWindow();
    createControlPanel();
    createTray();
    registerHotkey(currentHotkey);
    setupIpcHandlers();
    setupAutoUpdater();

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

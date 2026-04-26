const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage, shell, dialog, safeStorage, session, net, powerMonitor } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const SecureStorage = require('./secureStorage');
const RateLimiter = require('./rateLimiter');
const UsageTracker = require('./usageTracker');
const { validateIpcMessage, sanitizeString } = require('./ipcValidation');

// Lazy-load autoUpdater to avoid crash in dev mode (app not ready at import time)
let autoUpdater;
function getAutoUpdater() {
  if (!autoUpdater) {
    autoUpdater = require('electron-updater').autoUpdater;
  }
  return autoUpdater;
}

// DEBUG MODE - enabled automatically in unpackaged (dev) builds, disabled in packaged (production) builds
// Override with MURMULLO_DEBUG=1 env var if you need verbose logs in production.
const DEBUG = !app.isPackaged || process.env.MURMULLO_DEBUG === '1';

// Debug audio mode - saves all audio files for investigation
// Controlled via config file 'debugAudioEnabled' setting
// Audio files saved to %APPDATA%/murmullo/debug_audio/ with metadata JSON
let debugAudioEnabled = false;

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
// DEBUG AUDIO SAVING
// ==========================================
// Saves audio files and metadata for investigating transcription issues

async function saveDebugAudio(audioData, originalText, processedText, processingMode, latencyMs, source) {
  if (!debugAudioEnabled) {
    return; // Debug mode disabled
  }

  try {
    const debugAudioDir = path.join(app.getPath('userData'), 'debug_audio');
    if (!fs.existsSync(debugAudioDir)) {
      fs.mkdirSync(debugAudioDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `audio_${timestamp}`;

    // Detect audio format from header
    const audioBuffer = Buffer.from(audioData);
    const headerHex = audioBuffer.slice(0, 4).toString('hex');
    const headerString = audioBuffer.slice(0, 4).toString('ascii');

    let ext = 'bin'; // default
    if (headerString === 'RIFF') {
      ext = 'wav';
    } else if (headerHex === '1a45dfa3') {
      ext = 'webm';
    }

    // Save audio file
    const audioPath = path.join(debugAudioDir, `${baseFilename}.${ext}`);
    fs.writeFileSync(audioPath, audioBuffer);

    // Save metadata JSON
    const metadata = {
      timestamp: new Date().toISOString(),
      audioFile: `${baseFilename}.${ext}`,
      audioSizeBytes: audioBuffer.length,
      audioFormat: ext,
      processingMode,
      source, // 'backend' or 'local'
      latencyMs,
      originalText, // Raw Whisper output
      processedText, // After formatting/AI processing
      textWasModified: originalText !== processedText,
      wordCountOriginal: originalText?.split(/\s+/).filter(w => w).length || 0,
      wordCountProcessed: processedText?.split(/\s+/).filter(w => w).length || 0,
      appVersion: app.getVersion()
    };

    const metadataPath = path.join(debugAudioDir, `${baseFilename}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    log('DEBUG AUDIO: Saved', audioPath);
    log('DEBUG AUDIO: Metadata', metadataPath);

    // Clean up old debug files (keep last 100)
    cleanupOldDebugFiles(debugAudioDir, 100);

  } catch (err) {
    logError('DEBUG AUDIO: Failed to save:', err.message);
    // Don't throw - this is a debug feature, shouldn't break main functionality
  }
}

// Clean up old debug files, keeping only the most recent N files
function cleanupOldDebugFiles(debugDir, keepCount) {
  try {
    const files = fs.readdirSync(debugDir)
      .map(f => ({
        name: f,
        path: path.join(debugDir, f),
        time: fs.statSync(path.join(debugDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    // Group by base filename (audio + json pairs)
    const uniqueBases = [...new Set(files.map(f => f.name.replace(/\.(wav|webm|bin|json)$/, '')))];

    if (uniqueBases.length > keepCount) {
      const basesToDelete = uniqueBases.slice(keepCount);
      for (const base of basesToDelete) {
        for (const file of files.filter(f => f.name.startsWith(base))) {
          fs.unlinkSync(file.path);
          log('DEBUG AUDIO: Cleaned up old file:', file.name);
        }
      }
    }
  } catch (err) {
    // Ignore cleanup errors
  }
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
    // Connections: self + API endpoints (OpenAI, Anthropic, Groq, Google) + Murmullo backend
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://generativelanguage.googleapis.com https://murmullo-api.luminaconsulting.ai" + (isDev ? " ws://localhost:* http://localhost:*" : ""),
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
const rateLimiter = new RateLimiter();
let usageTracker = null; // Initialized after app is ready

// Abort controllers for in-flight network operations, so the user can cancel
// a pending transcription / AI post-processing from the floating mic icon.
const activeAbortControllers = new Set();
function cancelAllActiveRequests() {
  for (const ac of activeAbortControllers) {
    try { ac.abort(); } catch (e) {}
  }
  activeAbortControllers.clear();
}

// Backend mode settings
let backendMode = false;
let backendUrl = 'https://murmullo-api.luminaconsulting.ai';
let backendAccessToken = null;
let backendRefreshToken = null;

// ==========================================
// CUSTOM DICTIONARY
// ==========================================
// Stores user-defined word replacements for correcting Whisper transcription errors
// Example: "cojade" -> "COHADE"
let customDictionary = {
  version: 1,
  entries: [],
  settings: {
    maxWhisperPromptWords: 40,    // Max terms to include in Whisper prompt (224 token limit)
    enablePostProcessing: true,   // Apply find/replace after transcription
    enableWhisperHints: true      // Include terms in Whisper prompt
  }
};

// Load dictionary from config.json
function loadDictionary() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.customDictionary) {
        customDictionary = {
          version: config.customDictionary.version || 1,
          entries: config.customDictionary.entries || [],
          settings: {
            maxWhisperPromptWords: config.customDictionary.settings?.maxWhisperPromptWords || 40,
            enablePostProcessing: config.customDictionary.settings?.enablePostProcessing !== false,
            enableWhisperHints: config.customDictionary.settings?.enableWhisperHints !== false
          }
        };
        log('Dictionary loaded:', customDictionary.entries.length, 'entries');
      }
    }
  } catch (err) {
    logError('Failed to load dictionary:', err.message);
  }
}

// Save dictionary to config.json
function saveDictionary() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    config.customDictionary = customDictionary;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log('Dictionary saved:', customDictionary.entries.length, 'entries');
  } catch (err) {
    logError('Failed to save dictionary:', err.message);
  }
}

// Generate text for Whisper prompt with top N dictionary terms
function getDictionaryForWhisperPrompt() {
  if (!customDictionary.settings.enableWhisperHints) {
    return '';
  }

  const enabledEntries = customDictionary.entries.filter(e => e.enabled);
  if (enabledEntries.length === 0) {
    return '';
  }

  // Get the replacement terms (the correct spellings)
  // Limit to maxWhisperPromptWords to stay within token limits
  const terms = enabledEntries
    .slice(0, customDictionary.settings.maxWhisperPromptWords)
    .map(e => e.replace);

  return terms.join(', ');
}

// Escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Apply dictionary find/replace to text
function applyDictionaryReplacements(text) {
  if (!customDictionary.settings.enablePostProcessing) {
    return text;
  }

  const enabledEntries = customDictionary.entries.filter(e => e.enabled);
  if (enabledEntries.length === 0) {
    return text;
  }

  let result = text;
  let replacementsMade = 0;

  for (const entry of enabledEntries) {
    const escapedFind = escapeRegex(entry.find);
    const flags = entry.caseSensitive ? 'gu' : 'giu';

    // Use word boundaries to avoid partial replacements
    // \b doesn't work well with Unicode, so we use lookahead/lookbehind
    const pattern = new RegExp(`(?<=^|[\\s.,;:!?¿¡"'()\\[\\]{}])${escapedFind}(?=$|[\\s.,;:!?¿¡"'()\\[\\]{}])`, flags);

    const newResult = result.replace(pattern, entry.replace);
    if (newResult !== result) {
      replacementsMade++;
      result = newResult;
    }
  }

  if (replacementsMade > 0) {
    log('Dictionary replacements applied:', replacementsMade);
  }

  return result;
}

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
      backendUrl = config.backendUrl || 'https://murmullo-api.luminaconsulting.ai';
      backendAccessToken = config.backendAccessToken || null;
      backendRefreshToken = config.backendRefreshToken || null;
      debugAudioEnabled = config.debugAudioEnabled || false;
      log('Backend settings loaded:', { backendMode, backendUrl, hasToken: !!backendAccessToken, debugAudioEnabled });
    }
  } catch (err) {
    log('No backend settings found, using defaults');
  }
}

// Warmup ping to wake up Render (cold start prevention)
async function warmupBackend() {
  if (!backendMode || !backendUrl) {
    log('Skipping backend warmup - backend mode disabled or no URL');
    return;
  }

  const healthUrl = `${getBackendUrl()}/health`;

  log('Sending warmup ping to backend:', healthUrl);
  try {
    const startTime = Date.now();

    const response = await electronFetch(healthUrl, {
      method: 'GET'
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      log(`Backend warmup successful (${latency}ms)`);
    } else {
      log(`Backend warmup returned status ${response.status} (${latency}ms)`);
    }
  } catch (err) {
    log('Backend warmup failed (server may be starting):', {
      message: err.message,
      code: err.code,
      cause: err.cause?.message || err.cause
    });
    // Don't throw - this is just a warmup, not critical
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
    config.debugAudioEnabled = debugAudioEnabled;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log('Backend settings saved');
  } catch (err) {
    logError('Failed to save backend settings:', err);
  }
}

// Get normalized backend URL (removes trailing slashes)
function getBackendUrl() {
  return backendUrl.replace(/\/+$/, '');
}

// Use Electron's net.fetch which respects system proxy settings
// Falls back to Node's fetch if net is not available (shouldn't happen after app.ready)
function electronFetch(url, options = {}) {
  if (net && typeof net.fetch === 'function') {
    return net.fetch(url, options);
  }
  log('WARNING: net.fetch not available, using Node fetch (proxy may not work)');
  return fetch(url, options);
}

// Fetch with automatic retry for network errors
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (options.signal?.aborted) {
      const err = new Error('Operation cancelled');
      err.name = 'AbortError';
      throw err;
    }
    try {
      const response = await electronFetch(url, options);
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
      if (error.name === 'AbortError' || options.signal?.aborted) {
        throw error;
      }
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

// Make authenticated request to backend.
//
// Wraps the request in:
// - 30s timeout (AbortSignal.timeout) per attempt: kills long-hanging
//   ERR_CONNECTION_TIMED_OUT cases that previously sat for 55s+ before the user
//   cancelled manually.
// - up to 3 attempts with exponential backoff + jitter (base 500ms) for
//   network errors and 5xx responses. 4xx is returned immediately.
// - The original options.signal (user cancellation) is honored alongside the
//   per-attempt timeout via AbortSignal.any, so we can distinguish a user
//   cancel from a timeout in the catch site.
async function backendRequest(endpoint, options = {}) {
  const url = `${getBackendUrl()}${endpoint}`;

  const baseHeaders = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (backendAccessToken) {
    baseHeaders['Authorization'] = `Bearer ${backendAccessToken}`;
  }

  const PER_ATTEMPT_TIMEOUT_MS = 30_000;
  const MAX_ATTEMPTS = 3;
  let lastError;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // If the user already cancelled before we even start, surface that first.
    if (options.signal?.aborted) {
      const err = new Error('Operation cancelled');
      err.name = 'AbortError';
      throw err;
    }

    // Combine user signal with per-attempt timeout so cancel still works.
    const timeoutSignal = AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS);
    const signals = [timeoutSignal];
    if (options.signal) signals.push(options.signal);
    const combinedSignal = (typeof AbortSignal.any === 'function')
      ? AbortSignal.any(signals)
      : timeoutSignal; // older runtimes: at least keep the timeout

    try {
      const response = await electronFetch(url, {
        ...options,
        headers: baseHeaders,
        signal: combinedSignal
      });

      // Handle 401 - try to refresh token (only once, no need to retry on auth)
      if (response.status === 401 && backendRefreshToken) {
        const refreshed = await refreshBackendToken();
        if (refreshed) {
          baseHeaders['Authorization'] = `Bearer ${backendAccessToken}`;
          const retryResponse = await electronFetch(url, {
            ...options,
            headers: baseHeaders,
            signal: combinedSignal
          });
          return handleBackendResponse(retryResponse);
        }
      }

      // Retry on 5xx server errors only.
      if (response.status >= 500 && response.status < 600 && attempt < MAX_ATTEMPTS - 1) {
        const base = 500 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 250);
        const delay = base + jitter;
        log(`Backend server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return handleBackendResponse(response);
    } catch (error) {
      // Distinguish user cancellation from timeout. The user's signal aborts
      // with name 'AbortError'; AbortSignal.timeout aborts with name
      // 'TimeoutError' (or 'AbortError' on older runtimes; check user signal
      // first to disambiguate).
      const userCancelled = options.signal?.aborted === true;
      if (userCancelled) {
        logError('Backend request cancelled by user');
        const err = new Error('Operation cancelled');
        err.name = 'AbortError';
        throw err;
      }

      const isTimeout = error?.name === 'TimeoutError' ||
        (error?.name === 'AbortError' && timeoutSignal.aborted);

      lastError = error;

      // Retry on network errors and timeouts; not on 4xx (which is thrown
      // by handleBackendResponse, not raised as a fetch exception).
      if (attempt < MAX_ATTEMPTS - 1) {
        const base = 500 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 250);
        const delay = base + jitter;
        log(`Backend ${isTimeout ? 'timeout' : 'network error'}: ${error.message}; retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Final failure: surface a clear, user-facing message.
      const finalErr = new Error(
        isTimeout
          ? `Backend no respondió en ${PER_ATTEMPT_TIMEOUT_MS / 1000}s tras ${MAX_ATTEMPTS} intentos`
          : `Backend error: ${error.message}`
      );
      finalErr.cause = error;
      finalErr.code = isTimeout ? 'BACKEND_TIMEOUT' : 'BACKEND_NETWORK';
      logError('Backend request failed:', finalErr.message);
      throw finalErr;
    }
  }

  // Should be unreachable, but keep a guard.
  throw lastError || new Error('Backend error: unknown failure');
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
    const response = await electronFetch(`${getBackendUrl()}/api/v1/auth/refresh`, {
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

  // Send the user's custom-dictionary terms as the Whisper "initial prompt"
  // anchor, matching what local mode does in the `transcribe-audio` handler.
  // Without this, Whisper has no context for proper nouns, brand names, or
  // domain jargon, which produces noticeably worse transcriptions.
  const dictionaryHint = (typeof getDictionaryForWhisperPrompt === 'function')
    ? (getDictionaryForWhisperPrompt() || '')
    : '';

  // Pick the right model name for the backend's downstream provider so it
  // doesn't silently fall back to a generic default. The backend whitelists
  // these values.
  const provider = options.transcriptionProvider || null;
  const model = provider === 'groq'
    ? (options.groqModel || 'whisper-large-v3-turbo')
    : 'whisper-1';

  const data = await backendRequest('/api/v1/transcription', {
    method: 'POST',
    body: JSON.stringify({
      audio: base64Audio,
      language: options.language || 'es',
      model,
      ...(dictionaryHint && { dictionaryHint }),
      ...(provider && { provider })
    }),
    signal: options.signal
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
    }),
    signal: options.signal
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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      webgl: false
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

  // Periodically ensure window visibility and alwaysOnTop (every 90 seconds)
  // Windows can lose alwaysOnTop after sleep/wake, display changes, or fullscreen apps
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        mainWindow.showInactive();
        log('Periodic check: window was hidden, restored');
      }
      if (!mainWindow.isAlwaysOnTop()) {
        mainWindow.setAlwaysOnTop(true, 'floating');
        log('Periodic check: alwaysOnTop was lost, restored');
      }
    }
  }, 90 * 1000);

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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      spellcheck: true
    }
  });

  if (isDev) {
    controlPanel.loadURL(`${VITE_DEV_SERVER_URL}#/control-panel`);
  } else {
    controlPanel.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: '/control-panel' });
  }

  controlPanel.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      controlPanel.hide();
    }
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
      log('User clicked Salir - quitting app');
      app.isQuitting = true;

      // Force close all windows
      if (controlPanel && !controlPanel.isDestroyed()) {
        controlPanel.destroy();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }

      // Destroy tray
      if (tray) {
        tray.destroy();
        tray = null;
      }

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
    // Rate limit check (defends against runaway renderer loops & XSS-driven API exhaustion)
    const rl = rateLimiter.check(channel);
    if (!rl.ok) {
      logError(`IPC rate limit exceeded for ${channel}, retry in ${rl.retryAfterMs}ms`);
      return {
        success: false,
        error: 'rate_limit_exceeded',
        retryAfterMs: rl.retryAfterMs,
        message: `Demasiadas solicitudes. Intenta de nuevo en ${Math.ceil(rl.retryAfterMs / 1000)}s.`
      };
    }
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
  const updater = getAutoUpdater();
  updater.autoDownload = false; // Don't auto-download, let user decide
  updater.autoInstallOnAppQuit = true;

  // Log auto-updater events
  updater.logger = {
    info: (msg) => log('[AutoUpdater]', msg),
    warn: (msg) => log('[AutoUpdater WARN]', msg),
    error: (msg) => logError('[AutoUpdater]', msg),
    debug: (msg) => log('[AutoUpdater DEBUG]', msg)
  };

  updater.on('checking-for-update', () => {
    log('Checking for updates...');
    sendUpdateStatus('checking');
  });

  updater.on('update-available', (info) => {
    log('Update available:', info.version);
    updateAvailable = true;
    updateInfo = info;
    sendUpdateStatus('available', { version: info.version, releaseNotes: info.releaseNotes });
    logAction('UPDATE_AVAILABLE', { version: info.version });
  });

  updater.on('update-not-available', (info) => {
    log('No update available, current version is up to date');
    updateAvailable = false;
    sendUpdateStatus('not-available');
  });

  updater.on('download-progress', (progress) => {
    downloadProgress = Math.round(progress.percent);
    log('Download progress:', downloadProgress + '%');
    sendUpdateStatus('downloading', { percent: downloadProgress, bytesPerSecond: progress.bytesPerSecond });
  });

  updater.on('update-downloaded', (info) => {
    log('Update downloaded:', info.version);
    updateDownloaded = true;
    updateInfo = info;
    sendUpdateStatus('downloaded', { version: info.version });
    logAction('UPDATE_DOWNLOADED', { version: info.version });
  });

  updater.on('error', (error) => {
    logError('Auto-updater error:', error.message);
    sendUpdateStatus('error', { message: error.message });
  });

  // Check for updates after app is ready (only in production)
  if (!isDev) {
    // Initial check after a short delay
    setTimeout(() => {
      updater.checkForUpdates().catch(err => {
        log('Update check failed:', err.message);
      });
    }, 5000);

    // Check periodically (every 4 hours)
    setInterval(() => {
      updater.checkForUpdates().catch(err => {
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

  // Window drag support
  let dragStartWinPos = null;
  let dragStartCursor = null;
  let dragInterval = null;

  ipcMain.handle('window-start-drag', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { screen } = require('electron');
      dragStartWinPos = mainWindow.getPosition();
      dragStartCursor = screen.getCursorScreenPoint();
      // Poll cursor position for smooth dragging even outside the small window
      dragInterval = setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed() && dragStartWinPos) {
          const cursor = screen.getCursorScreenPoint();
          const dx = cursor.x - dragStartCursor.x;
          const dy = cursor.y - dragStartCursor.y;
          mainWindow.setPosition(dragStartWinPos[0] + dx, dragStartWinPos[1] + dy);
        }
      }, 16); // ~60fps
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('window-drag-end', () => {
    if (dragInterval) {
      clearInterval(dragInterval);
      dragInterval = null;
    }
    dragStartWinPos = null;
    dragStartCursor = null;
    return { success: true };
  });

  // Transcribe audio
  ipcMain.handle('transcribe-audio', async (event, audioData, options) => {
    // Validate input
    const validation = validateIpcMessage('transcribe-audio', audioData, options);
    if (!validation.isValid) {
      logError('Transcribe validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    // Track this request so it can be cancelled from the floating mic icon.
    const abortController = new AbortController();
    activeAbortControllers.add(abortController);
    const abortSignal = abortController.signal;
    const cleanupAbort = () => activeAbortControllers.delete(abortController);

    try {

    const processingMode = options?.processingMode || 'fast'; // verbatim, fast, or smart
    log('=== TRANSCRIBE AUDIO START ===');
    log('Audio data length:', audioData?.length || 0);
    log('Options:', JSON.stringify({ language: options?.language, processingMode }));
    log('Backend mode:', backendMode, 'Has token:', !!backendAccessToken);

    // Rate limit protection (defense-in-depth; createValidatedHandler also checks)
    const rl = rateLimiter.check('transcribe-audio');
    if (!rl.ok) {
      logError(`transcribe-audio rate-limited, retry in ${rl.retryAfterMs}ms`);
      return {
        success: false,
        error: 'rate_limit_exceeded',
        retryAfterMs: rl.retryAfterMs,
        message: `Demasiadas transcripciones. Espera ${Math.ceil(rl.retryAfterMs / 1000)}s.`
      };
    }

    // Free-tier enforcement: only applies when NOT using backend and NOT bringing own key
    // If user has stored their own key, mark the tracker so future checks skip the ceiling.
    const userOwnKey = secureStorage?.getSecure('openai_api_key') || '';
    if (usageTracker) {
      usageTracker.markOwnApiKey(!!userOwnKey);
      const gate = usageTracker.canTranscribe({
        backendAuthenticated: backendMode && !!backendAccessToken
      });
      if (!gate.allowed) {
        logError('Free tier exhausted, blocking transcription');
        return {
          success: false,
          error: 'free_tier_exhausted',
          code: 'FREE_TIER_EXHAUSTED',
          message: 'Agotaste los 30 minutos de prueba gratis. Agrega tu propia API key o suscríbete a un plan.',
          usage: gate
        };
      }
    }

    // If backend mode is enabled and user is authenticated, use backend.
    // On NETWORK failure (timeout, connection refused, 5xx) we transparently
    // fall back to local mode if the user has a local key for the configured
    // provider. This avoids a hard outage when the backend is down.
    let backendFallbackActive = false;
    if (backendMode && backendAccessToken) {
      try {
        const startTime = Date.now();
        const result = await transcribeViaBackend(audioData, { ...options, signal: abortSignal });
        const elapsedTime = Date.now() - startTime;

        // Apply list formatting only if NOT verbatim mode
        let formattedText = processingMode === 'verbatim' ? result.text : formatNumberedLists(result.text);

        // Apply custom dictionary replacements (except in verbatim mode)
        if (processingMode !== 'verbatim') {
          formattedText = applyDictionaryReplacements(formattedText);
        }

        log('=== BACKEND TRANSCRIBE SUCCESS ===');
        log('Processing mode:', processingMode);
        log('Words:', formattedText.split(/\s+/).length, 'chars:', formattedText.length);
        log(`Backend latency: ${elapsedTime}ms`);

        // Save debug audio if enabled
        await saveDebugAudio(audioData, result.text, formattedText, processingMode, elapsedTime, 'backend');

        logAction('TRANSCRIPTION_COMPLETE_BACKEND', {
          wordCount: formattedText.split(/\s+/).length,
          latencyMs: elapsedTime,
          audioSizeKB: Math.round(audioData.length / 1024),
          processingMode
        });

        return { success: true, text: formattedText, latencyMs: elapsedTime, viaBackend: true, processingMode };
      } catch (error) {
        if (error.name === 'AbortError' || abortSignal.aborted) {
          log('Backend transcription cancelled by user');
          return { success: false, error: 'cancelled', code: 'CANCELLED' };
        }
        logError('Backend transcription failed:', error.message);

        // Decide whether to fall back. We only fall back on network-class
        // failures (timeout, connection issues, 5xx). Auth/quota/rate-limit
        // errors thrown by the backend with .status set in 4xx are NOT
        // transient and would just fail again locally for unrelated reasons.
        const isNetworkClass =
          error?.code === 'BACKEND_TIMEOUT' ||
          error?.code === 'BACKEND_NETWORK' ||
          (typeof error?.status === 'number' && error.status >= 500);

        // Choose a local provider the user can actually use. We respect the
        // configured transcriptionProvider first, then fall back to whichever
        // key exists.
        const preferredProvider = options?.transcriptionProvider === 'groq' ? 'groq' : 'openai';
        const hasOpenAIKey = !!(secureStorage?.getSecure('openai_api_key') || options?.apiKey || process.env.OPENAI_API_KEY);
        const hasGroqKey = !!(secureStorage?.getSecure('groq_api_key') || options?.groqApiKey || process.env.GROQ_API_KEY);
        const localProvider =
          (preferredProvider === 'groq' && hasGroqKey) ? 'groq' :
          (preferredProvider === 'openai' && hasOpenAIKey) ? 'openai' :
          hasOpenAIKey ? 'openai' :
          hasGroqKey ? 'groq' :
          null;

        if (isNetworkClass && localProvider) {
          logAction('BACKEND_FALLBACK_TO_LOCAL', {
            reason: error?.code || 'unknown',
            chosenProvider: localProvider,
            preferredProvider
          });
          log(`Backend failed (${error?.code || error.message}); falling back to local mode with provider=${localProvider}`);
          backendFallbackActive = true;
          // Override the provider on options so the local branch uses the
          // available key. We mutate a shallow copy to avoid touching caller state.
          options = { ...options, transcriptionProvider: localProvider };
          // Fall through to the local transcription path below.
        } else if (isNetworkClass && !localProvider) {
          return {
            success: false,
            error: 'Backend no disponible y no hay API key local configurada. Agrega una en Configuración para no quedarte sin servicio cuando esto pase.',
            code: 'BACKEND_DOWN_NO_LOCAL_KEY'
          };
        } else {
          return { success: false, error: `Error de backend: ${error.message}` };
        }
      }
    }

    try {
      // Pick transcription provider. Groq serves an OpenAI-compatible endpoint
      // running Whisper Large v3 Turbo much faster than OpenAI. Default stays
      // on 'openai' so existing users don't see a behavior change until they
      // opt in from Configuración.
      const transcriptionProvider = options?.transcriptionProvider === 'groq' ? 'groq' : 'openai';
      const apiKey = transcriptionProvider === 'groq'
        ? (secureStorage?.getSecure('groq_api_key') || options?.groqApiKey || process.env.GROQ_API_KEY)
        : (secureStorage?.getSecure('openai_api_key') || options?.apiKey || process.env.OPENAI_API_KEY);
      const whisperEndpoint = transcriptionProvider === 'groq'
        ? 'https://api.groq.com/openai/v1/audio/transcriptions'
        : 'https://api.openai.com/v1/audio/transcriptions';
      const whisperModel = transcriptionProvider === 'groq'
        ? (options?.groqModel || 'whisper-large-v3-turbo')
        : 'whisper-1';
      log('Transcription provider:', transcriptionProvider, 'model:', whisperModel);
      log('API key present:', !!apiKey);
      log('API key length:', apiKey?.length || 0);
      // Don't log API key prefix for security

      if (!apiKey) {
        throw new Error(
          transcriptionProvider === 'groq'
            ? 'Groq API key no configurada. Agrégala en Configuración → API Keys.'
            : 'OpenAI API key no configurada. Agrégala en Configuración → API Keys.'
        );
      }

      if (!audioData || audioData.length === 0) {
        throw new Error('No se recibió audio');
      }

      // Check minimum audio size (at least 1KB to be valid)
      if (audioData.length < 1000) {
        throw new Error(`Audio demasiado corto (${audioData.length} bytes). Habla por más tiempo.`);
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
        `${whisperModel}${CRLF}`
      );

      // Language part
      // Groq doesn't support language: 'auto', so map it to 'es' (default for Murmullo)
      // OpenAI Whisper supports 'auto' for language detection
      let languageCode = options?.language || 'es';
      if (transcriptionProvider === 'groq' && languageCode === 'auto') {
        log('Groq does not support auto language detection, defaulting to Spanish');
        languageCode = 'es';
      }
      parts.push(
        `--${boundary}${CRLF}`,
        `Content-Disposition: form-data; name="language"${CRLF}${CRLF}`,
        `${languageCode}${CRLF}`
      );

      // Prompt part - helps anchor Whisper and reduce hallucinations
      // Include dictionary terms to help Whisper recognize custom words
      const dictTerms = getDictionaryForWhisperPrompt();
      const whisperPrompt = dictTerms
        ? `Transcripción literal de dictado de voz en español. Términos especiales: ${dictTerms}. Transcribir exactamente lo que se dice, palabra por palabra, sin interpretar ni resumir.`
        : `Transcripción literal de dictado de voz en español. Transcribir exactamente lo que se dice, palabra por palabra, sin interpretar ni resumir.`;

      parts.push(
        `--${boundary}${CRLF}`,
        `Content-Disposition: form-data; name="prompt"${CRLF}${CRLF}`,
        `${whisperPrompt}${CRLF}`
      );

      // Temperature part - 0 = most deterministic/literal transcription
      parts.push(
        `--${boundary}${CRLF}`,
        `Content-Disposition: form-data; name="temperature"${CRLF}${CRLF}`,
        `0${CRLF}`
      );

      // End boundary
      parts.push(`--${boundary}--${CRLF}`);

      // Combine all parts into a single buffer
      const bodyParts = parts.map(part =>
        Buffer.isBuffer(part) ? part : Buffer.from(part, 'utf-8')
      );
      const bodyBuffer = Buffer.concat(bodyParts);

      log('Sending to Whisper API...', uploadFilename, 'body size:', bodyBuffer.length);

      const response = await fetchWithRetry(whisperEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer,
        signal: abortSignal
      }, 3); // Retry up to 3 times

      log('Whisper API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        logError('Whisper API error:', errorText);
        throw new Error(`Error de Whisper API: ${errorText}`);
      }

      const result = await response.json();
      const elapsedTime = Date.now() - startTime;

      // Apply list formatting only if NOT verbatim mode
      let formattedText = processingMode === 'verbatim' ? result.text : formatNumberedLists(result.text);

      // Apply custom dictionary replacements (except in verbatim mode)
      if (processingMode !== 'verbatim') {
        formattedText = applyDictionaryReplacements(formattedText);
      }

      log('=== TRANSCRIBE AUDIO SUCCESS ===');
      log('Processing mode:', processingMode);
      log('Transcription complete - words:', formattedText.split(/\s+/).length, 'chars:', formattedText.length);
      log(`Whisper API latency: ${elapsedTime}ms (no FFmpeg conversion)`);

      // Record usage: estimate duration from WAV buffer (16kHz mono 16-bit = 32000 bytes/sec)
      // For WebM we fall back to a rough estimate based on transcribed word count.
      try {
        let durationSec = 0;
        if (isWAV && audioBuffer.length > 44) {
          durationSec = (audioBuffer.length - 44) / 32000;
        } else {
          // Rough estimate: ~2.5 words/sec of speech
          const wordCount = formattedText.split(/\s+/).filter(Boolean).length;
          durationSec = Math.max(1, wordCount / 2.5);
        }
        usageTracker?.record(durationSec);
        log(`Recorded usage: ${durationSec.toFixed(2)}s`);
      } catch (usageErr) {
        logError('Usage recording failed:', usageErr.message);
      }

      // Save debug audio if enabled
      await saveDebugAudio(audioData, result.text, formattedText, processingMode, elapsedTime, 'local');

      // Log action for analytics (word count, latency - no personal content)
      logAction('TRANSCRIPTION_COMPLETE', {
        wordCount: formattedText.split(/\s+/).length,
        latencyMs: elapsedTime,
        audioSizeKB: Math.round(audioData.length / 1024),
        listFormatted: formattedText !== result.text,
        processingMode,
        viaFallback: backendFallbackActive
      });

      const usageAfter = usageTracker?.summary();
      return {
        success: true,
        text: formattedText,
        latencyMs: elapsedTime,
        processingMode,
        usage: usageAfter,
        viaBackendFallback: backendFallbackActive || undefined
      };
    } catch (error) {
      logError('=== TRANSCRIBE AUDIO ERROR ===');
      logError('Error:', error.message);
      logError('Stack:', error.stack);
      if (error.name === 'AbortError' || abortSignal.aborted) {
        return { success: false, error: 'cancelled', code: 'CANCELLED' };
      }
      return { success: false, error: error.message };
    }

    } finally {
      cleanupAbort();
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

    // Rate limit (defense-in-depth; AI providers charge per token)
    const rl = rateLimiter.check('process-text');
    if (!rl.ok) {
      logError(`process-text rate-limited, retry in ${rl.retryAfterMs}ms`);
      return {
        success: false,
        error: 'rate_limit_exceeded',
        retryAfterMs: rl.retryAfterMs,
        message: `Demasiadas llamadas al procesador. Espera ${Math.ceil(rl.retryAfterMs / 1000)}s.`
      };
    }

    // Track this request so the user can cancel the AI post-processing step.
    const abortController = new AbortController();
    activeAbortControllers.add(abortController);
    const abortSignal = abortController.signal;
    const cleanupAbort = () => activeAbortControllers.delete(abortController);

    try {

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
        const result = await processTextViaBackend(sanitizedText, { ...options, signal: abortSignal });
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
        if (error.name === 'AbortError' || abortSignal.aborted) {
          log('Backend AI processing cancelled by user');
          return { success: false, error: 'cancelled', code: 'CANCELLED' };
        }
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

        if (!apiKey) throw new Error('Anthropic API key no configurada. Agrégala en Configuración → API Keys.');

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
          body: JSON.stringify(body),
          signal: abortSignal
        }, 3);

        const aiLatency = Date.now() - aiStartTime;
        log('Anthropic response status:', response.status);
        log(`Claude Haiku latency: ${aiLatency}ms`);

        if (!response.ok) {
          const error = await response.text();
          logError('Anthropic API error:', error);
          throw new Error(`Error de Anthropic API: ${error}`);
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

        if (!apiKey) throw new Error('OpenAI API key no configurada. Agrégala en Configuración → API Keys.');

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
          body: JSON.stringify(body),
          signal: abortSignal
        }, 3);

        log('OpenAI response status:', response.status);

        if (!response.ok) {
          const error = await response.text();
          logError('OpenAI API error:', error);
          throw new Error(`Error de OpenAI API: ${error}`);
        }

        const result = await response.json();
        log('OpenAI processing complete');
        return { success: true, text: result.choices[0].message.content };
      }

      throw new Error(`Proveedor de IA desconocido: ${provider}`);
    } catch (error) {
      if (error.name === 'AbortError' || abortSignal.aborted) {
        log('AI processing cancelled by user');
        return { success: false, error: 'cancelled', code: 'CANCELLED' };
      }
      logError('Process text error:', error.message);
      return { success: false, error: error.message };
    }

    } finally {
      cleanupAbort();
    }
  });

  // Read the user's clipboard text on demand. Chromium disables the "Paste"
  // item in the native context menu for `<input type="password">` as a
  // security measure, which leaves no obvious way to paste API keys into the
  // settings UI. A dedicated "Pegar" button in the renderer calls this IPC,
  // so paste requires an explicit user gesture.
  ipcMain.handle('read-clipboard', () => {
    try {
      const text = clipboard.readText() || '';
      return { success: true, text };
    } catch (err) {
      logError('read-clipboard failed:', err.message);
      return { success: false, error: err.message, text: '' };
    }
  });

  // Bridge structured log lines from the renderer to the main-process file
  // logs so users can inspect them in Configuración → Logs. Useful for
  // instrumenting things like the silence gate without forcing users to open
  // DevTools. The renderer is trusted code we wrote, but we still keep this
  // cheap and validate the payload shape.
  ipcMain.handle('log-from-renderer', (event, payload) => {
    try {
      if (!payload || typeof payload !== 'object') return { success: false };
      const level = typeof payload.level === 'string' ? payload.level.slice(0, 16) : 'INFO';
      const tag = typeof payload.tag === 'string' ? payload.tag.slice(0, 64) : 'renderer';
      const data = payload.data;
      const safeData = typeof data === 'string'
        ? data.slice(0, 1000)
        : (() => { try { return JSON.stringify(data).slice(0, 1000); } catch { return '[unserializable]'; } })();
      if (level === 'ERROR') logError(`[renderer:${tag}]`, safeData);
      else log(`[renderer:${tag}]`, safeData);
      return { success: true };
    } catch (err) {
      logError('log-from-renderer failed:', err.message);
      return { success: false };
    }
  });

  // Cancel any in-flight transcription / AI post-processing request. Called
  // from the floating mic icon's hover "X" button. Aborts fetches so the user
  // does not have to wait for stuck network calls to time out.
  ipcMain.handle('cancel-transcription', () => {
    const count = activeAbortControllers.size;
    if (count > 0) {
      log(`Cancelling ${count} in-flight request(s) by user request`);
      cancelAllActiveRequests();
      logAction('TRANSCRIPTION_CANCELLED');
      return { success: true, cancelled: count };
    }
    return { success: true, cancelled: 0 };
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

      // Re-show the floating window after paste completes
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.showInactive();
          mainWindow.setAlwaysOnTop(true, 'floating');
          log('Main window restored after paste');
        }
      }, 500);

      return { success: true };
    } catch (error) {
      logError('Paste error:', error);
      // Ensure window is restored even on error
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, 'floating');
      }
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
        `INSERT INTO transcriptions (timestamp, original_text, processed_text, is_processed, processing_method, agent_name, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          timestamp,
          data.original_text,
          data.processed_text || null,
          data.is_processed ? 1 : 0,
          data.processing_method || 'none',
          data.agent_name || null,
          data.error || null
        ]
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
    controlPanel?.focus();
  });

  ipcMain.handle('hide-control-panel', () => {
    log('Hiding control panel');
    controlPanel?.hide();
  });

  // Context menu for the floating mic icon (right-click).
  // Mirrors the main tray menu but is triggered directly over the floating
  // window, which is the more discoverable entry point for most users.
  ipcMain.handle('show-floating-menu', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { success: false };

    const menu = Menu.buildFromTemplate([
      { label: 'Configuración', click: () => {
        if (controlPanel && !controlPanel.isDestroyed()) {
          controlPanel.show();
          controlPanel.focus();
        }
      }},
      { label: 'Exportar Logs', click: () => {
        const logsDir = path.join(app.getPath('userData'), 'logs');
        if (fs.existsSync(logsDir)) {
          shell.openPath(logsDir);
          logAction('LOGS_FOLDER_OPENED_FROM_FLOATING_MENU');
        }
      }},
      { type: 'separator' },
      { label: 'Acerca de Murmullo...', click: () => {
        const appVersion = app.getVersion();
        dialog.showMessageBox({
          type: 'info',
          title: 'Acerca de Murmullo',
          message: `Murmullo v${appVersion}`,
          detail: `Dictado de voz para desarrolladores hispanohablantes.\n\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}\nPlataforma: ${process.platform} (${process.arch})\n\nHotkey actual: ${currentHotkey || 'Ctrl+Shift+Space'}`,
          buttons: ['OK']
        });
        logAction('ABOUT_DIALOG_SHOWN_FROM_FLOATING_MENU');
      }},
      { type: 'separator' },
      { label: 'Salir', click: () => {
        log('User clicked Salir from floating menu');
        app.isQuitting = true;
        if (controlPanel && !controlPanel.isDestroyed()) controlPanel.destroy();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
        if (tray) { tray.destroy(); tray = null; }
        app.quit();
      }}
    ]);

    menu.popup({ window: mainWindow });
    return { success: true };
  });

  // API Keys - get from secure storage (or env as fallback)
  ipcMain.handle('get-api-keys', () => {
    log('Getting API keys');
    // Try secure storage first, then env as fallback
    const openaiKey = secureStorage?.getSecure('openai_api_key') || process.env.OPENAI_API_KEY || '';
    const anthropicKey = secureStorage?.getSecure('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || '';
    const groqKey = secureStorage?.getSecure('groq_api_key') || process.env.GROQ_API_KEY || '';

    return {
      openai: openaiKey,
      anthropic: anthropicKey,
      groq: groqKey,
      // Include masked versions for UI display
      openaiMasked: openaiKey ? maskApiKey(openaiKey) : '',
      anthropicMasked: anthropicKey ? maskApiKey(anthropicKey) : '',
      groqMasked: groqKey ? maskApiKey(groqKey) : ''
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
      const storageKey = (
        provider === 'openai' ? 'openai_api_key' :
        provider === 'groq' ? 'groq_api_key' :
        'anthropic_api_key'
      );
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
  // Validate API key against provider's live endpoint (cheap call that only checks auth)
  ipcMain.handle('validate-api-key', async (event, provider, key) => {
    const validation = validateIpcMessage('validate-api-key', provider, key);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }
    const rl = rateLimiter.check('validate-api-key');
    if (!rl.ok) {
      return { success: false, error: 'rate_limit_exceeded', retryAfterMs: rl.retryAfterMs };
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let response;
      if (provider === 'openai') {
        response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal
        });
      } else if (provider === 'anthropic') {
        // Anthropic doesn't have a free GET endpoint; hit /v1/messages with a 1-token request
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }]
          }),
          signal: controller.signal
        });
      } else if (provider === 'groq') {
        // Groq exposes an OpenAI-compatible /models endpoint
        response = await fetch('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal
        });
      } else {
        clearTimeout(timeoutId);
        return { success: false, error: 'Unsupported provider' };
      }
      clearTimeout(timeoutId);
      if (response.ok) {
        return { success: true, valid: true, provider };
      }
      // 401/403 means bad key; other errors mean we couldn't verify
      if (response.status === 401 || response.status === 403) {
        return { success: true, valid: false, reason: 'unauthorized', provider };
      }
      const bodyText = await response.text().catch(() => '');
      return {
        success: true,
        valid: false,
        reason: 'provider_error',
        status: response.status,
        bodyPreview: bodyText.slice(0, 200)
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'timeout', message: 'La validación tardó más de 8s.' };
      }
      return { success: false, error: 'network', message: err.message };
    }
  });

  // Usage / free-tier (for UI counter and paywall)
  ipcMain.handle('get-usage', () => {
    if (!usageTracker) return { success: false, error: 'Usage tracker not initialized' };
    const gate = usageTracker.canTranscribe({
      backendAuthenticated: backendMode && !!backendAccessToken
    });
    return {
      success: true,
      summary: usageTracker.summary(),
      gate,
      backendAuthenticated: backendMode && !!backendAccessToken
    };
  });

  ipcMain.handle('reset-usage', () => {
    if (!usageTracker) return { success: false };
    // Only allow reset in dev mode (avoid abuse in production)
    if (app.isPackaged && process.env.MURMULLO_ALLOW_USAGE_RESET !== '1') {
      return { success: false, error: 'Not allowed in production' };
    }
    usageTracker.reset();
    return { success: true, summary: usageTracker.summary() };
  });

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
    log('URL (raw):', url);
    // Normalize URL: remove trailing slashes
    backendUrl = url.replace(/\/+$/, '');
    log('URL (normalized):', backendUrl);
    saveBackendSettings();
    log('Backend URL saved');
    return { success: true, backendUrl };
  });

  // Check backend health
  ipcMain.handle('check-backend-health', async () => {
    const healthUrl = `${getBackendUrl()}/health`;
    log('Checking backend health at:', healthUrl);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await electronFetch(healthUrl, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      log('Backend health response:', response.ok, response.status);
      return { online: response.ok };
    } catch (error) {
      // Log detailed error info for debugging corporate network issues
      logError('Backend health check failed:', {
        message: error.message,
        code: error.code,
        cause: error.cause?.message || error.cause,
        type: error.name,
        url: healthUrl
      });
      return { online: false, error: error.message };
    }
  });

  // Backend login
  ipcMain.handle('backend-login', async (event, email, password) => {
    log('Backend login attempt for:', email);
    try {
      const response = await electronFetch(`${getBackendUrl()}/api/v1/auth/login`, {
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
      const response = await electronFetch(`${getBackendUrl()}/api/v1/auth/register`, {
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
        await electronFetch(`${getBackendUrl()}/api/v1/auth/logout`, {
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
      const result = await getAutoUpdater().checkForUpdates();
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
      await getAutoUpdater().downloadUpdate();
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
    getAutoUpdater().quitAndInstall(false, true);
    return { success: true };
  });

  // ==========================================
  // DEBUG AUDIO HANDLERS
  // ==========================================

  // Get debug audio settings
  ipcMain.handle('get-debug-audio-settings', () => {
    const debugAudioDir = path.join(app.getPath('userData'), 'debug_audio');
    let fileCount = 0;
    let totalSizeKB = 0;

    if (fs.existsSync(debugAudioDir)) {
      const files = fs.readdirSync(debugAudioDir);
      fileCount = files.filter(f => f.endsWith('.wav') || f.endsWith('.webm') || f.endsWith('.bin')).length;
      totalSizeKB = Math.round(files.reduce((acc, f) => {
        try {
          return acc + fs.statSync(path.join(debugAudioDir, f)).size;
        } catch {
          return acc;
        }
      }, 0) / 1024);
    }

    return {
      enabled: debugAudioEnabled,
      path: debugAudioDir,
      fileCount,
      totalSizeKB
    };
  });

  // Set debug audio enabled
  ipcMain.handle('set-debug-audio-enabled', (event, enabled) => {
    log('Setting debug audio mode:', enabled);
    debugAudioEnabled = enabled;
    saveBackendSettings();
    logAction('DEBUG_AUDIO_MODE_CHANGED', { enabled });
    return { success: true, enabled: debugAudioEnabled };
  });

  // Open debug audio folder
  ipcMain.handle('open-debug-audio-folder', () => {
    const debugAudioDir = path.join(app.getPath('userData'), 'debug_audio');
    if (!fs.existsSync(debugAudioDir)) {
      fs.mkdirSync(debugAudioDir, { recursive: true });
    }
    shell.openPath(debugAudioDir);
    logAction('DEBUG_AUDIO_FOLDER_OPENED');
    return { success: true, path: debugAudioDir };
  });

  // Clear all debug audio files
  ipcMain.handle('clear-debug-audio', () => {
    try {
      const debugAudioDir = path.join(app.getPath('userData'), 'debug_audio');
      if (fs.existsSync(debugAudioDir)) {
        const files = fs.readdirSync(debugAudioDir);
        let deletedCount = 0;
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(debugAudioDir, file));
            deletedCount++;
          } catch (e) {
            // Ignore individual file errors
          }
        }
        log('Cleared debug audio files:', deletedCount);
        logAction('DEBUG_AUDIO_CLEARED', { deletedCount });
        return { success: true, deleted: deletedCount };
      }
      return { success: true, deleted: 0 };
    } catch (error) {
      logError('Failed to clear debug audio:', error.message);
      return { success: false, error: error.message };
    }
  });

  // ==========================================
  // DICTIONARY HANDLERS
  // ==========================================

  // Get dictionary
  ipcMain.handle('get-dictionary', () => {
    return customDictionary;
  });

  // Set entire dictionary (used for import or bulk updates)
  ipcMain.handle('set-dictionary', (event, dict) => {
    const validation = validateIpcMessage('set-dictionary', dict);
    if (!validation.isValid) {
      logError('Set-dictionary validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      customDictionary = {
        version: dict.version || 1,
        entries: dict.entries || [],
        settings: {
          maxWhisperPromptWords: dict.settings?.maxWhisperPromptWords || 40,
          enablePostProcessing: dict.settings?.enablePostProcessing !== false,
          enableWhisperHints: dict.settings?.enableWhisperHints !== false
        }
      };
      saveDictionary();
      logAction('DICTIONARY_UPDATED', { entryCount: customDictionary.entries.length });
      return { success: true, dictionary: customDictionary };
    } catch (error) {
      logError('Failed to set dictionary:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Add dictionary entry
  ipcMain.handle('add-dictionary-entry', (event, entry) => {
    const validation = validateIpcMessage('add-dictionary-entry', entry);
    if (!validation.isValid) {
      logError('Add-dictionary-entry validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      const newEntry = {
        id: require('crypto').randomUUID(),
        find: entry.find.trim(),
        replace: entry.replace.trim(),
        caseSensitive: entry.caseSensitive || false,
        enabled: entry.enabled !== false,
        soundsLike: entry.soundsLike?.trim() || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      customDictionary.entries.push(newEntry);
      saveDictionary();
      logAction('DICTIONARY_ENTRY_ADDED', { find: newEntry.find, replace: newEntry.replace });
      return { success: true, entry: newEntry };
    } catch (error) {
      logError('Failed to add dictionary entry:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Update dictionary entry
  ipcMain.handle('update-dictionary-entry', (event, id, updates) => {
    const validation = validateIpcMessage('update-dictionary-entry', id, updates);
    if (!validation.isValid) {
      logError('Update-dictionary-entry validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      const entryIndex = customDictionary.entries.findIndex(e => e.id === id);
      if (entryIndex === -1) {
        return { success: false, error: 'Entry not found' };
      }

      const entry = customDictionary.entries[entryIndex];
      if (updates.find !== undefined) entry.find = updates.find.trim();
      if (updates.replace !== undefined) entry.replace = updates.replace.trim();
      if (updates.caseSensitive !== undefined) entry.caseSensitive = updates.caseSensitive;
      if (updates.enabled !== undefined) entry.enabled = updates.enabled;
      if (updates.soundsLike !== undefined) entry.soundsLike = updates.soundsLike.trim();
      entry.updatedAt = new Date().toISOString();

      saveDictionary();
      logAction('DICTIONARY_ENTRY_UPDATED', { id, updates: Object.keys(updates) });
      return { success: true, entry };
    } catch (error) {
      logError('Failed to update dictionary entry:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Delete dictionary entry
  ipcMain.handle('delete-dictionary-entry', (event, id) => {
    const validation = validateIpcMessage('delete-dictionary-entry', id);
    if (!validation.isValid) {
      logError('Delete-dictionary-entry validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      const entryIndex = customDictionary.entries.findIndex(e => e.id === id);
      if (entryIndex === -1) {
        return { success: false, error: 'Entry not found' };
      }

      customDictionary.entries.splice(entryIndex, 1);
      saveDictionary();
      logAction('DICTIONARY_ENTRY_DELETED', { id });
      return { success: true };
    } catch (error) {
      logError('Failed to delete dictionary entry:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Import dictionary from JSON
  ipcMain.handle('import-dictionary', (event, json) => {
    const validation = validateIpcMessage('import-dictionary', json);
    if (!validation.isValid) {
      logError('Import-dictionary validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      const imported = typeof json === 'string' ? JSON.parse(json) : json;

      // Validate structure
      if (!imported || !Array.isArray(imported.entries)) {
        return { success: false, error: 'Invalid dictionary format' };
      }

      // Merge entries (add new ones, skip duplicates by find value)
      const existingFinds = new Set(customDictionary.entries.map(e => e.find.toLowerCase()));
      let addedCount = 0;

      for (const entry of imported.entries) {
        if (!entry.find || !entry.replace) continue;
        if (existingFinds.has(entry.find.toLowerCase())) continue;

        customDictionary.entries.push({
          id: require('crypto').randomUUID(),
          find: entry.find.trim(),
          replace: entry.replace.trim(),
          caseSensitive: entry.caseSensitive || false,
          enabled: entry.enabled !== false,
          soundsLike: entry.soundsLike?.trim() || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        existingFinds.add(entry.find.toLowerCase());
        addedCount++;
      }

      // Import settings if provided
      if (imported.settings) {
        if (imported.settings.maxWhisperPromptWords !== undefined) {
          customDictionary.settings.maxWhisperPromptWords = imported.settings.maxWhisperPromptWords;
        }
        if (imported.settings.enablePostProcessing !== undefined) {
          customDictionary.settings.enablePostProcessing = imported.settings.enablePostProcessing;
        }
        if (imported.settings.enableWhisperHints !== undefined) {
          customDictionary.settings.enableWhisperHints = imported.settings.enableWhisperHints;
        }
      }

      saveDictionary();
      logAction('DICTIONARY_IMPORTED', { addedCount, totalEntries: customDictionary.entries.length });
      return { success: true, addedCount, totalEntries: customDictionary.entries.length };
    } catch (error) {
      logError('Failed to import dictionary:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Export dictionary to JSON
  ipcMain.handle('export-dictionary', () => {
    try {
      const exportData = {
        version: customDictionary.version,
        exportedAt: new Date().toISOString(),
        entries: customDictionary.entries,
        settings: customDictionary.settings
      };
      logAction('DICTIONARY_EXPORTED', { entryCount: customDictionary.entries.length });
      return { success: true, data: exportData };
    } catch (error) {
      logError('Failed to export dictionary:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Test dictionary replacements on sample text
  ipcMain.handle('test-replacement', (event, text) => {
    const validation = validateIpcMessage('test-replacement', text);
    if (!validation.isValid) {
      logError('Test-replacement validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      const result = applyDictionaryReplacements(text);
      return { success: true, original: text, result, changed: text !== result };
    } catch (error) {
      logError('Failed to test replacement:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Update dictionary settings
  ipcMain.handle('update-dictionary-settings', (event, settings) => {
    const validation = validateIpcMessage('update-dictionary-settings', settings);
    if (!validation.isValid) {
      logError('Update-dictionary-settings validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    try {
      if (settings.maxWhisperPromptWords !== undefined) {
        customDictionary.settings.maxWhisperPromptWords = Math.max(1, Math.min(100, settings.maxWhisperPromptWords));
      }
      if (settings.enablePostProcessing !== undefined) {
        customDictionary.settings.enablePostProcessing = !!settings.enablePostProcessing;
      }
      if (settings.enableWhisperHints !== undefined) {
        customDictionary.settings.enableWhisperHints = !!settings.enableWhisperHints;
      }
      saveDictionary();
      logAction('DICTIONARY_SETTINGS_UPDATED', settings);
      return { success: true, settings: customDictionary.settings };
    } catch (error) {
      logError('Failed to update dictionary settings:', error.message);
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

    // Configure session to use system proxy (for corporate networks)
    try {
      await session.defaultSession.setProxy({ mode: 'system' });
      log('Proxy configured to use system settings');
    } catch (proxyErr) {
      logError('Failed to configure system proxy:', proxyErr.message);
    }

    // Initialize secure storage for API keys
    const secureStoragePath = path.join(app.getPath('userData'), 'secure-keys.json');
    secureStorage = new SecureStorage(secureStoragePath);
    log('Secure storage initialized, encryption available:', secureStorage.isEncryptionAvailable());

    // Initialize free-tier usage tracker
    const usageStoragePath = path.join(app.getPath('userData'), 'usage.json');
    usageTracker = new UsageTracker(usageStoragePath);
    log('Usage tracker initialized:', usageTracker.summary());

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

    // Load custom dictionary
    loadDictionary();

    // Warmup backend in background (don't await - let app continue starting)
    warmupBackend().catch(err => log('Warmup error (non-critical):', err.message));

    await initDatabase();
    createMainWindow();
    createControlPanel();
    createTray();
    registerHotkey(currentHotkey);
    setupIpcHandlers();
    setupAutoUpdater();

    // First-run detection: if there is no marker file yet, open the control
    // panel so the user lands directly on the WelcomeModal instead of only
    // seeing the tiny floating icon.
    try {
      const firstRunMarker = path.join(app.getPath('userData'), '.first-run-completed');
      if (!fs.existsSync(firstRunMarker)) {
        log('First run detected, opening control panel with onboarding');
        // Give the window a moment to render before showing.
        setTimeout(() => {
          if (controlPanel && !controlPanel.isDestroyed()) {
            controlPanel.show();
            controlPanel.focus();
          }
        }, 1200);
        fs.writeFileSync(firstRunMarker, new Date().toISOString());
      }
    } catch (firstRunErr) {
      logError('First-run check failed:', firstRunErr.message);
    }

    // Restore window visibility after system resume (sleep/wake)
    powerMonitor.on('resume', () => {
      log('System resumed from sleep');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, 'floating');
        log('Window restored after system resume');
      }
    });

    // Restore window visibility when display metrics change (resolution, monitor add/remove, DPI)
    const { screen } = require('electron');
    screen.on('display-metrics-changed', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, 'floating');
        log('Window restored after display metrics changed');
      }
    });

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

app.on('before-quit', () => {
  log('App before-quit - setting isQuitting flag');
  app.isQuitting = true;
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

  // Close log stream
  if (logStream) {
    logStream.end();
    logStream = null;
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

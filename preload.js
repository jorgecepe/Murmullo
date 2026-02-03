const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Transcription
  transcribeAudio: (audioData, options) =>
    ipcRenderer.invoke('transcribe-audio', audioData, options),

  // AI Processing
  processText: (text, options) =>
    ipcRenderer.invoke('process-text', text, options),

  // Clipboard / Paste
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // Database
  getTranscriptions: (limit) => ipcRenderer.invoke('get-transcriptions', limit),
  saveTranscription: (data) => ipcRenderer.invoke('save-transcription', data),

  // Control Panel
  showControlPanel: () => ipcRenderer.invoke('show-control-panel'),
  hideControlPanel: () => ipcRenderer.invoke('hide-control-panel'),

  // API Keys (secure storage)
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  setApiKey: (provider, key) => ipcRenderer.invoke('set-api-key', provider, key),
  checkEncryption: () => ipcRenderer.invoke('check-encryption'),

  // Logs
  getLogsPath: () => ipcRenderer.invoke('get-logs-path'),
  listLogFiles: () => ipcRenderer.invoke('list-log-files'),
  readLogFile: (filename) => ipcRenderer.invoke('read-log-file', filename),
  exportLogs: () => ipcRenderer.invoke('export-logs'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  clearOldLogs: (keepDays) => ipcRenderer.invoke('clear-old-logs', keepDays),

  // App Info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Hotkey management
  getHotkey: () => ipcRenderer.invoke('get-hotkey'),
  setHotkey: (hotkey) => ipcRenderer.invoke('set-hotkey', hotkey),
  getAvailableHotkeys: () => ipcRenderer.invoke('get-available-hotkeys'),

  // Backend mode
  getBackendSettings: () => ipcRenderer.invoke('get-backend-settings'),
  setBackendMode: (enabled) => ipcRenderer.invoke('set-backend-mode', enabled),
  setBackendUrl: (url) => ipcRenderer.invoke('set-backend-url', url),
  checkBackendHealth: () => ipcRenderer.invoke('check-backend-health'),
  backendLogin: (email, password) => ipcRenderer.invoke('backend-login', email, password),
  backendRegister: (email, password, name) => ipcRenderer.invoke('backend-register', email, password, name),
  backendLogout: () => ipcRenderer.invoke('backend-logout'),
  backendGetMe: () => ipcRenderer.invoke('backend-get-me'),
  backendGetUsage: () => ipcRenderer.invoke('backend-get-usage'),

  // Auto-updates
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Debug Audio
  getDebugAudioSettings: () => ipcRenderer.invoke('get-debug-audio-settings'),
  setDebugAudioEnabled: (enabled) => ipcRenderer.invoke('set-debug-audio-enabled', enabled),
  openDebugAudioFolder: () => ipcRenderer.invoke('open-debug-audio-folder'),
  clearDebugAudio: () => ipcRenderer.invoke('clear-debug-audio'),

  // Events
  onToggleDictation: (callback) => {
    const handler = (event) => callback();
    ipcRenderer.on('toggle-dictation', handler);
    return () => ipcRenderer.removeListener('toggle-dictation', handler);
  },

  onUpdateStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  }
});

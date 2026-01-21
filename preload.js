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

  // API Keys
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),

  // Logs
  getLogsPath: () => ipcRenderer.invoke('get-logs-path'),
  listLogFiles: () => ipcRenderer.invoke('list-log-files'),
  readLogFile: (filename) => ipcRenderer.invoke('read-log-file', filename),
  exportLogs: () => ipcRenderer.invoke('export-logs'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  clearOldLogs: (keepDays) => ipcRenderer.invoke('clear-old-logs', keepDays),

  // Events
  onToggleDictation: (callback) => {
    const handler = (event) => callback();
    ipcRenderer.on('toggle-dictation', handler);
    return () => ipcRenderer.removeListener('toggle-dictation', handler);
  }
});

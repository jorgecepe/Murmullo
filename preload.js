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

  // Events
  onToggleDictation: (callback) => {
    const handler = (event) => callback();
    ipcRenderer.on('toggle-dictation', handler);
    return () => ipcRenderer.removeListener('toggle-dictation', handler);
  }
});

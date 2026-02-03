import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Electron APIs for renderer tests
global.window = global.window || {};
global.window.electronAPI = {
  transcribeAudio: vi.fn(),
  processText: vi.fn(),
  pasteText: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getTranscriptions: vi.fn(),
  saveTranscription: vi.fn(),
  getStats: vi.fn(),
  deleteTranscription: vi.fn(),
  clearHistory: vi.fn(),
  showControlPanel: vi.fn(),
  hideControlPanel: vi.fn(),
  quitApp: vi.fn(),
  getApiKeys: vi.fn(),
  setApiKey: vi.fn(),
  checkEncryption: vi.fn(),
  onToggleDictation: vi.fn(),
  onHotkeyChange: vi.fn(),
  onAppUpdate: vi.fn(),
  readLogFile: vi.fn(),
  listLogFiles: vi.fn(),
  getLogsPath: vi.fn(),
  exportLogs: vi.fn(),
  openLogsFolder: vi.fn(),
  clearOldLogs: vi.fn(),
  getAppVersion: vi.fn(),
  getAppInfo: vi.fn(),
  getHotkey: vi.fn(),
  setHotkey: vi.fn(),
  getAvailableHotkeys: vi.fn(),
  // Backend mode handlers
  getBackendSettings: vi.fn().mockResolvedValue({ backendMode: false, backendUrl: 'http://localhost:3000', isAuthenticated: false }),
  setBackendMode: vi.fn().mockResolvedValue({ success: true }),
  setBackendUrl: vi.fn().mockResolvedValue({ success: true }),
  checkBackendHealth: vi.fn().mockResolvedValue({ online: false }),
  backendLogin: vi.fn(),
  backendRegister: vi.fn(),
  backendLogout: vi.fn().mockResolvedValue({ success: true }),
  backendGetMe: vi.fn().mockResolvedValue({ success: false }),
  backendGetUsage: vi.fn().mockResolvedValue({ success: false })
};

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
global.localStorage = localStorageMock;

// Mock navigator.mediaDevices for audio tests
global.navigator = {
  mediaDevices: {
    getUserMedia: vi.fn()
  }
};

// Mock MediaRecorder
global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  state: 'inactive'
}));
global.MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);

// Mock Blob
global.Blob = class Blob {
  constructor(parts, options) {
    this.parts = parts;
    this.options = options;
    this.size = parts.reduce((acc, part) => acc + (part.length || part.byteLength || 0), 0);
    this.type = options?.type || '';
  }
  arrayBuffer() {
    return Promise.resolve(new ArrayBuffer(this.size));
  }
};

// Mock AudioContext
global.AudioContext = vi.fn().mockImplementation(() => ({
  createMediaStreamSource: vi.fn(),
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn()
  }),
  close: vi.fn()
}));

// Console spy for debugging
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

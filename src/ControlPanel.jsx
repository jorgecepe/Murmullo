import React, { useState, useEffect, Component } from 'react';
import { Settings, History, Key, Keyboard, X, Save, Trash2, BarChart3, Clock, FileText, Zap, HelpCircle, DollarSign, ExternalLink, FolderOpen, Download, ScrollText, RefreshCw, Github, Info, Shield, ShieldCheck, ShieldAlert, User, Cloud, CloudOff, LogOut, Loader2, Mail, Lock, AlertCircle, ArrowDownCircle, CheckCircle2, XCircle } from 'lucide-react';

// Error Boundary to catch rendering errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ControlPanel Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-red-400 mb-4">⚠️ Error en el Panel de Control</h1>
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
              <p className="font-mono text-sm">{this.state.error?.toString()}</p>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
            >
              Reintentar
            </button>
            {this.state.errorInfo && (
              <details className="mt-4">
                <summary className="cursor-pointer text-slate-400">Stack trace</summary>
                <pre className="mt-2 p-4 bg-slate-800 rounded text-xs overflow-auto">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS = {
  GENERAL: 'general',
  ACCOUNT: 'account',
  API_KEYS: 'api-keys',
  HOTKEY: 'hotkey',
  HISTORY: 'history',
  STATS: 'stats',
  UPDATES: 'updates',
  LOGS: 'logs',
  HELP: 'help'
};

// Pricing constants (updated Jan 2026)
const PRICING = {
  whisperPerMinute: 0.006,  // USD per minute of audio
  claudeHaikuInputPer1M: 0.25,
  claudeHaikuOutputPer1M: 1.25,
  gpt4oMiniInputPer1M: 0.15,
  gpt4oMiniOutputPer1M: 0.60,
  avgTokensPerWord: 1.3,  // Approximate for Spanish
};

function ControlPanel() {
  const [activeTab, setActiveTab] = useState(TABS.GENERAL);
  const [settings, setSettings] = useState({
    language: 'es',
    processingMode: 'smart',
    reasoningProvider: 'anthropic',
    reasoningModel: 'claude-3-haiku-20240307',
    soundEnabled: true  // Completion sound enabled by default
  });
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    anthropic: '',
    openaiMasked: '',
    anthropicMasked: ''
  });
  const [encryptionStatus, setEncryptionStatus] = useState({ available: false, platform: '' });
  const [apiKeySaveStatus, setApiKeySaveStatus] = useState({ openai: '', anthropic: '' });
  const [history, setHistory] = useState([]);
  const [saved, setSaved] = useState(false);
  const [logFiles, setLogFiles] = useState([]);
  const [selectedLogContent, setSelectedLogContent] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [appInfo, setAppInfo] = useState({ version: '...', hotkey: 'CommandOrControl+Shift+Space' });
  const [currentHotkey, setCurrentHotkey] = useState('CommandOrControl+Shift+Space');
  const [availableHotkeys, setAvailableHotkeys] = useState([]);
  const [customHotkey, setCustomHotkey] = useState('');
  const [hotkeyStatus, setHotkeyStatus] = useState({ message: '', type: '' });

  // Backend/Online mode state
  const [backendMode, setBackendMode] = useState(false);
  const [backendUrl, setBackendUrl] = useState('http://localhost:3000');
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking', 'online', 'offline'
  const [user, setUser] = useState(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userUsage, setUserUsage] = useState(null);

  // Auto-update state
  const [updateStatus, setUpdateStatus] = useState({
    status: 'idle', // idle, checking, available, downloading, downloaded, error, not-available
    updateAvailable: false,
    updateDownloaded: false,
    version: null,
    downloadProgress: 0,
    error: null,
    currentVersion: '...'
  });

  // Load settings on mount
  useEffect(() => {
    const loadedSettings = {
      language: localStorage.getItem('language') || 'es',
      processingMode: localStorage.getItem('processingMode') || 'smart',
      reasoningProvider: localStorage.getItem('reasoningProvider') || 'anthropic',
      reasoningModel: localStorage.getItem('reasoningModel') || 'claude-3-haiku-20240307',
      soundEnabled: localStorage.getItem('soundEnabled') !== 'false' // Default true
    };
    setSettings(loadedSettings);

    // Load API keys from secure storage
    if (window.electronAPI?.getApiKeys) {
      window.electronAPI.getApiKeys().then(keys => {
        setApiKeys({
          openai: '', // Don't store actual keys in state
          anthropic: '',
          openaiMasked: keys.openaiMasked || '',
          anthropicMasked: keys.anthropicMasked || '',
          openaiHasKey: !!keys.openai,
          anthropicHasKey: !!keys.anthropic
        });
      });
    }

    // Check encryption status
    if (window.electronAPI?.checkEncryption) {
      window.electronAPI.checkEncryption().then(status => {
        setEncryptionStatus(status);
      });
    }

    // Load history
    loadHistory();

    // Load app info (version, etc.)
    if (window.electronAPI?.getAppInfo) {
      window.electronAPI.getAppInfo().then(info => {
        setAppInfo(info);
        if (info.hotkey) {
          setCurrentHotkey(info.hotkey);
        }
      });
    }

    // Load available hotkeys
    if (window.electronAPI?.getAvailableHotkeys) {
      window.electronAPI.getAvailableHotkeys().then(hotkeys => {
        setAvailableHotkeys(hotkeys);
      });
    }

    // Load current hotkey
    if (window.electronAPI?.getHotkey) {
      window.electronAPI.getHotkey().then(hotkey => {
        if (hotkey) {
          setCurrentHotkey(hotkey);
        }
      });
    }

    // Load backend settings from main process
    if (window.electronAPI?.getBackendSettings) {
      window.electronAPI.getBackendSettings().then(settings => {
        setBackendMode(settings.backendMode);
        setBackendUrl(settings.backendUrl);
        if (settings.backendMode) {
          checkBackendAndLoadUser();
        } else {
          setBackendStatus('offline');
        }
      });
    }

    // Load update status
    if (window.electronAPI?.getUpdateStatus) {
      window.electronAPI.getUpdateStatus().then(status => {
        setUpdateStatus(prev => ({
          ...prev,
          updateAvailable: status.updateAvailable,
          updateDownloaded: status.updateDownloaded,
          version: status.updateInfo?.version || null,
          downloadProgress: status.downloadProgress,
          currentVersion: status.currentVersion,
          status: status.updateDownloaded ? 'downloaded' : status.updateAvailable ? 'available' : 'idle'
        }));
      });
    }

    // Listen for update status changes
    let unsubscribeUpdate;
    if (window.electronAPI?.onUpdateStatus) {
      unsubscribeUpdate = window.electronAPI.onUpdateStatus((data) => {
        console.log('[ControlPanel] Update status:', data);
        setUpdateStatus(prev => ({
          ...prev,
          status: data.status,
          version: data.version || prev.version,
          downloadProgress: data.percent || prev.downloadProgress,
          error: data.message || null,
          updateAvailable: data.status === 'available' || data.status === 'downloading' || data.status === 'downloaded' || prev.updateAvailable,
          updateDownloaded: data.status === 'downloaded' || prev.updateDownloaded
        }));
      });
    }

    return () => {
      if (unsubscribeUpdate) unsubscribeUpdate();
    };
  }, []);

  // Check backend status and load user
  const checkBackendAndLoadUser = async () => {
    setBackendStatus('checking');
    try {
      const healthResult = await window.electronAPI?.checkBackendHealth();
      const isOnline = healthResult?.online || false;
      setBackendStatus(isOnline ? 'online' : 'offline');

      if (isOnline) {
        try {
          const result = await window.electronAPI.backendGetMe();
          if (result.success) {
            setUser(result.user);
            setUserUsage(result.limits);
          } else {
            // Not authenticated
            setUser(null);
          }
        } catch (err) {
          setUser(null);
        }
      }
    } catch (err) {
      setBackendStatus('offline');
    }
  };

  // Toggle backend mode
  const toggleBackendMode = async (enabled) => {
    setBackendMode(enabled);
    await window.electronAPI?.setBackendMode(enabled);

    if (enabled) {
      // Also save the current URL when enabling
      await window.electronAPI?.setBackendUrl(backendUrl);
      await checkBackendAndLoadUser();
    } else {
      setBackendStatus('offline');
      setUser(null);
    }
  };

  // Update backend URL
  const updateBackendUrl = async (url) => {
    setBackendUrl(url);
    await window.electronAPI?.setBackendUrl(url);
    if (backendMode) {
      await checkBackendAndLoadUser();
    }
  };

  // Handle auth form submit
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      let result;
      if (isRegister) {
        result = await window.electronAPI.backendRegister(
          authForm.email,
          authForm.password,
          authForm.name
        );
      } else {
        result = await window.electronAPI.backendLogin(
          authForm.email,
          authForm.password
        );
      }

      if (result.success) {
        setUser(result.user || { email: authForm.email, plan: 'free' });
        setShowLoginForm(false);
        setAuthForm({ email: '', password: '', name: '' });
        // Load usage info
        try {
          const meResult = await window.electronAPI.backendGetMe();
          if (meResult.success && meResult.limits) {
            setUserUsage(meResult.limits);
          }
        } catch (meError) {
          console.error('Failed to load user usage:', meError);
          // Don't fail the whole auth flow if usage fetch fails
        }
      } else {
        setAuthError(result.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await window.electronAPI.backendLogout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setUser(null);
    setUserUsage(null);
  };

  const loadHistory = async () => {
    if (window.electronAPI) {
      const transcriptions = await window.electronAPI.getTranscriptions(500); // Get more for stats
      setHistory(transcriptions);
    }
  };

  // Auto-update functions
  const checkForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    setUpdateStatus(prev => ({ ...prev, status: 'checking', error: null }));
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (!result.success && result.error) {
        setUpdateStatus(prev => ({ ...prev, status: 'error', error: result.error }));
      }
    } catch (err) {
      setUpdateStatus(prev => ({ ...prev, status: 'error', error: err.message }));
    }
  };

  const downloadUpdate = async () => {
    if (!window.electronAPI?.downloadUpdate) return;
    setUpdateStatus(prev => ({ ...prev, status: 'downloading', downloadProgress: 0 }));
    try {
      await window.electronAPI.downloadUpdate();
    } catch (err) {
      setUpdateStatus(prev => ({ ...prev, status: 'error', error: err.message }));
    }
  };

  const installUpdate = async () => {
    if (!window.electronAPI?.installUpdate) return;
    try {
      await window.electronAPI.installUpdate();
    } catch (err) {
      setUpdateStatus(prev => ({ ...prev, status: 'error', error: err.message }));
    }
  };

  // Load log files
  const loadLogFiles = async () => {
    if (window.electronAPI) {
      setLoadingLogs(true);
      try {
        const files = await window.electronAPI.listLogFiles();
        setLogFiles(files);
      } catch (err) {
        console.error('Error loading log files:', err);
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  // Read a specific log file
  const readLogFile = async (filename) => {
    if (window.electronAPI) {
      setLoadingLogs(true);
      try {
        const result = await window.electronAPI.readLogFile(filename);
        if (result.success) {
          setSelectedLogContent({ filename, content: result.content });
        }
      } catch (err) {
        console.error('Error reading log file:', err);
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  // Export logs to file
  const exportLogs = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.exportLogs();
      if (result.success) {
        alert(`Logs exportados a: ${result.path}`);
      }
    }
  };

  // Open logs folder in file explorer
  const openLogsFolder = async () => {
    if (window.electronAPI) {
      await window.electronAPI.openLogsFolder();
    }
  };

  // Clear old logs
  const clearOldLogs = async (days = 30) => {
    if (window.electronAPI) {
      const result = await window.electronAPI.clearOldLogs(days);
      if (result.success) {
        alert(`Se eliminaron ${result.deleted} archivos de log antiguos.`);
        loadLogFiles();
      }
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Calculate statistics from history
  const calculateStats = () => {
    if (history.length === 0) {
      return {
        totalTranscriptions: 0,
        totalWords: 0,
        avgWordsPerTranscription: 0,
        estimatedTypingTimeSaved: 0,
        todayTranscriptions: 0,
        todayWords: 0,
        thisWeekWords: 0,
        smartModeUsage: 0,
        fastModeUsage: 0,
        estimatedCost: { whisper: 0, claude: 0, total: 0 },
        estimatedAudioMinutes: 0
      };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    let totalWords = 0;
    let todayWords = 0;
    let todayTranscriptions = 0;
    let thisWeekWords = 0;
    let smartModeCount = 0;
    let fastModeCount = 0;

    history.forEach(item => {
      const text = item.processed_text || item.original_text || '';
      const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      totalWords += wordCount;

      const itemDate = new Date(item.timestamp);

      if (itemDate >= todayStart) {
        todayWords += wordCount;
        todayTranscriptions++;
      }

      if (itemDate >= weekStart) {
        thisWeekWords += wordCount;
      }

      if (item.is_processed) {
        smartModeCount++;
      } else {
        fastModeCount++;
      }
    });

    const avgWordsPerTranscription = history.length > 0 ? Math.round(totalWords / history.length) : 0;

    // Assuming average typing speed of 40 WPM
    const typingWPM = 40;
    const estimatedTypingTimeSaved = Math.round(totalWords / typingWPM);

    // Estimate audio minutes (assuming ~150 words per minute of speech)
    const wordsPerMinuteSpeech = 150;
    const estimatedAudioMinutes = totalWords / wordsPerMinuteSpeech;

    // Calculate estimated costs
    const whisperCost = estimatedAudioMinutes * PRICING.whisperPerMinute;
    const totalTokens = totalWords * PRICING.avgTokensPerWord;
    const claudeCost = smartModeCount > 0
      ? (totalTokens / 1000000) * (PRICING.claudeHaikuInputPer1M + PRICING.claudeHaikuOutputPer1M) * (smartModeCount / history.length)
      : 0;

    return {
      totalTranscriptions: history.length,
      totalWords,
      avgWordsPerTranscription,
      estimatedTypingTimeSaved,
      todayTranscriptions,
      todayWords,
      thisWeekWords,
      smartModeUsage: Math.round((smartModeCount / history.length) * 100) || 0,
      fastModeUsage: Math.round((fastModeCount / history.length) * 100) || 0,
      estimatedCost: {
        whisper: whisperCost,
        claude: claudeCost,
        total: whisperCost + claudeCost
      },
      estimatedAudioMinutes: Math.round(estimatedAudioMinutes * 10) / 10
    };
  };

  const stats = calculateStats();
  const autoSaveTimeoutRef = React.useRef(null);
  const [autoSaving, setAutoSaving] = React.useState(false);

  // Auto-save settings with debounce
  const autoSaveSettings = React.useCallback((newSettings) => {
    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Debounce: wait 1 second before saving
    autoSaveTimeoutRef.current = setTimeout(() => {
      Object.entries(newSettings).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
      setAutoSaving(true);
      setTimeout(() => setAutoSaving(false), 1500);
    }, 1000);
  }, []);

  const handleSettingChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    autoSaveSettings(newSettings);
  };

  const handleApiKeyChange = (key, value) => {
    setApiKeys(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = () => {
    // Save to localStorage
    Object.entries(settings).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });

    // Save API keys
    localStorage.setItem('openaiKey', apiKeys.openai);
    localStorage.setItem('anthropicKey', apiKeys.anthropic);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const closePanel = () => {
    window.electronAPI?.hideControlPanel();
  };

  // Change hotkey function
  const changeHotkey = async (newHotkey) => {
    if (!window.electronAPI?.setHotkey) {
      setHotkeyStatus({ message: 'API no disponible', type: 'error' });
      return;
    }

    setHotkeyStatus({ message: 'Cambiando...', type: 'info' });

    try {
      const result = await window.electronAPI.setHotkey(newHotkey);
      if (result.success) {
        setCurrentHotkey(newHotkey);
        setHotkeyStatus({ message: '¡Hotkey cambiado exitosamente!', type: 'success' });
        setTimeout(() => setHotkeyStatus({ message: '', type: '' }), 3000);
      } else {
        setHotkeyStatus({ message: result.error || 'Error al cambiar hotkey', type: 'error' });
      }
    } catch (err) {
      setHotkeyStatus({ message: 'Error: ' + err.message, type: 'error' });
    }
  };

  // Format hotkey for display (make it more readable)
  const formatHotkeyDisplay = (hotkey) => {
    if (!hotkey) return '';
    return hotkey
      .replace('CommandOrControl', 'Ctrl')
      .replace('Control', 'Ctrl')
      .replace('Command', 'Cmd')
      .replace(/\+/g, ' + ');
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case TABS.GENERAL:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Idioma de transcripción
              </label>
              <select
                value={settings.language}
                onChange={(e) => handleSettingChange('language', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="auto">Auto-detectar</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Modo de procesamiento
              </label>
              <select
                value={settings.processingMode}
                onChange={(e) => handleSettingChange('processingMode', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fast">Rápido (solo transcripción)</option>
                <option value="smart">Inteligente (con corrección IA)</option>
              </select>
              <p className="mt-1 text-xs text-slate-400">
                El modo inteligente corrige gramática y preserva términos técnicos en inglés.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Proveedor de IA
              </label>
              <select
                value={settings.reasoningProvider}
                onChange={(e) => handleSettingChange('reasoningProvider', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Modelo
              </label>
              <select
                value={settings.reasoningModel}
                onChange={(e) => handleSettingChange('reasoningModel', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {settings.reasoningProvider === 'anthropic' ? (
                  <>
                    <option value="claude-3-haiku-20240307">Claude 3 Haiku (rápido, económico)</option>
                    <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  </>
                ) : (
                  <>
                    <option value="gpt-4o-mini">GPT-4o Mini (rápido, económico)</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  </>
                )}
              </select>
            </div>

            {/* Sound toggle */}
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">Sonido de completado</h3>
                  <p className="text-sm text-slate-400">
                    Reproduce un sonido al terminar una transcripción
                  </p>
                </div>
                <button
                  onClick={() => handleSettingChange('soundEnabled', !settings.soundEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.soundEnabled ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        );

      case TABS.ACCOUNT:
        return (
          <div className="space-y-6">
            {/* Backend Mode Toggle */}
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium text-white">Modo de conexión</h3>
                  <p className="text-sm text-slate-400">
                    {backendMode
                      ? 'Conectado al servidor (no necesitas API keys propias)'
                      : 'Modo offline (usa tus propias API keys)'}
                  </p>
                </div>
                <button
                  onClick={() => toggleBackendMode(!backendMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    backendMode ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      backendMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {backendMode && (
                <div className="mt-4">
                  <label className="block text-sm text-slate-400 mb-1">URL del servidor</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={backendUrl}
                      onChange={(e) => setBackendUrl(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                      placeholder="https://api.murmullo.app"
                    />
                    <button
                      onClick={() => updateBackendUrl(backendUrl)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                    >
                      Conectar
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {backendStatus === 'checking' && (
                      <>
                        <Loader2 size={14} className="animate-spin text-blue-400" />
                        <span className="text-sm text-slate-400">Verificando conexión...</span>
                      </>
                    )}
                    {backendStatus === 'online' && (
                      <>
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="text-sm text-green-400">Servidor conectado</span>
                      </>
                    )}
                    {backendStatus === 'offline' && (
                      <>
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        <span className="text-sm text-red-400">Servidor no disponible</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Section (when backend mode is on) */}
            {backendMode && backendStatus === 'online' && (
              <div className="p-4 bg-slate-700/50 rounded-lg">
                {user ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <User size={20} className="text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{user.name || user.email}</p>
                          <p className="text-sm text-slate-400">{user.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <LogOut size={16} />
                        Cerrar sesión
                      </button>
                    </div>

                    {/* Plan and Usage */}
                    {userUsage && (
                      <div className="mt-4 p-3 bg-slate-800 rounded">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-slate-400">Plan actual</span>
                          <span className="px-2 py-0.5 bg-blue-600 rounded text-xs text-white capitalize">
                            {user?.plan || 'free'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Uso este mes</span>
                            <span className="text-white">
                              {(parseFloat(userUsage.minutes_used) || 0).toFixed(1)} / {userUsage.minutes_limit === -1 ? '∞' : (userUsage.minutes_limit || 30)} min
                            </span>
                          </div>
                          {userUsage.minutes_limit !== -1 && userUsage.minutes_limit > 0 && (
                            <div className="w-full bg-slate-700 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full transition-all"
                                style={{ width: `${Math.min(100, ((userUsage.minutes_used || 0) / (userUsage.minutes_limit || 30)) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : showLoginForm ? (
                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-white">
                        {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowLoginForm(false);
                          setAuthError('');
                          setAuthForm({ email: '', password: '', name: '' });
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {authError && (
                      <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                        <AlertCircle size={16} />
                        {authError}
                      </div>
                    )}

                    {isRegister && (
                      <div>
                        <label className="block text-sm text-slate-400 mb-1">Nombre</label>
                        <div className="relative">
                          <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            value={authForm.name}
                            onChange={(e) => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-slate-800 text-white pl-10 pr-4 py-2 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                            placeholder="Tu nombre"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Email</label>
                      <div className="relative">
                        <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="email"
                          value={authForm.email}
                          onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                          required
                          className="w-full bg-slate-800 text-white pl-10 pr-4 py-2 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                          placeholder="tu@email.com"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Contraseña</label>
                      <div className="relative">
                        <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="password"
                          value={authForm.password}
                          onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                          required
                          minLength={8}
                          className="w-full bg-slate-800 text-white pl-10 pr-4 py-2 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                          placeholder="Mínimo 8 caracteres"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white py-2 rounded font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {authLoading && <Loader2 size={18} className="animate-spin" />}
                      {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
                    </button>

                    <div className="text-center text-sm text-slate-400">
                      {isRegister ? (
                        <>
                          ¿Ya tienes cuenta?{' '}
                          <button
                            type="button"
                            onClick={() => setIsRegister(false)}
                            className="text-blue-400 hover:underline"
                          >
                            Inicia sesión
                          </button>
                        </>
                      ) : (
                        <>
                          ¿No tienes cuenta?{' '}
                          <button
                            type="button"
                            onClick={() => setIsRegister(true)}
                            className="text-blue-400 hover:underline"
                          >
                            Regístrate
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="text-center py-6">
                    <User size={48} className="mx-auto text-slate-500 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Inicia sesión</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Accede a tu cuenta para usar Murmullo sin necesidad de API keys propias.
                    </p>
                    <button
                      onClick={() => setShowLoginForm(true)}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
                    >
                      Iniciar sesión
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Offline mode info */}
            {!backendMode && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <h3 className="font-medium text-amber-400 mb-2">Modo offline activo</h3>
                <p className="text-sm text-slate-300">
                  En este modo, debes configurar tus propias API keys en la pestaña "API Keys".
                  Las transcripciones se procesan directamente desde tu computadora.
                </p>
              </div>
            )}
          </div>
        );

      case TABS.API_KEYS:
        return (
          <div className="space-y-6">
            {/* Encryption status indicator */}
            <div className={`p-4 rounded-lg flex items-center gap-3 ${
              encryptionStatus.available
                ? 'bg-green-500/10 border border-green-500/30'
                : 'bg-amber-500/10 border border-amber-500/30'
            }`}>
              {encryptionStatus.available ? (
                <>
                  <ShieldCheck className="text-green-400" size={24} />
                  <div>
                    <p className="text-sm font-medium text-green-400">Almacenamiento seguro activo</p>
                    <p className="text-xs text-slate-400">Las API keys están cifradas con la protección del sistema operativo.</p>
                  </div>
                </>
              ) : (
                <>
                  <ShieldAlert className="text-amber-400" size={24} />
                  <div>
                    <p className="text-sm font-medium text-amber-400">Cifrado no disponible</p>
                    <p className="text-xs text-slate-400">Las keys se almacenan con protección básica. Considera actualizar tu sistema.</p>
                  </div>
                </>
              )}
            </div>

            {/* OpenAI API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                OpenAI API Key
              </label>
              {apiKeys.openaiHasKey ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-400 font-mono text-sm">
                    {apiKeys.openaiMasked || '••••••••'}
                  </div>
                  <button
                    onClick={async () => {
                      if (window.electronAPI?.setApiKey) {
                        await window.electronAPI.setApiKey('openai', '');
                        setApiKeys(prev => ({ ...prev, openaiHasKey: false, openaiMasked: '' }));
                        setApiKeySaveStatus(prev => ({ ...prev, openai: 'removed' }));
                        setTimeout(() => setApiKeySaveStatus(prev => ({ ...prev, openai: '' })), 2000);
                      }
                    }}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeys.openai}
                    onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={async () => {
                      if (window.electronAPI?.setApiKey && apiKeys.openai) {
                        const result = await window.electronAPI.setApiKey('openai', apiKeys.openai);
                        if (result.success) {
                          setApiKeys(prev => ({
                            ...prev,
                            openai: '',
                            openaiHasKey: true,
                            openaiMasked: result.masked
                          }));
                          setApiKeySaveStatus(prev => ({ ...prev, openai: 'saved' }));
                          setTimeout(() => setApiKeySaveStatus(prev => ({ ...prev, openai: '' })), 2000);
                        }
                      }
                    }}
                    disabled={!apiKeys.openai}
                    className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <Shield size={18} />
                  </button>
                </div>
              )}
              {apiKeySaveStatus.openai && (
                <p className={`mt-1 text-xs ${apiKeySaveStatus.openai === 'saved' ? 'text-green-400' : 'text-red-400'}`}>
                  {apiKeySaveStatus.openai === 'saved' ? 'Key guardada de forma segura' : 'Key eliminada'}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Necesario para transcripción con Whisper y procesamiento con GPT.
              </p>
            </div>

            {/* Anthropic API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Anthropic API Key
              </label>
              {apiKeys.anthropicHasKey ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-400 font-mono text-sm">
                    {apiKeys.anthropicMasked || '••••••••'}
                  </div>
                  <button
                    onClick={async () => {
                      if (window.electronAPI?.setApiKey) {
                        await window.electronAPI.setApiKey('anthropic', '');
                        setApiKeys(prev => ({ ...prev, anthropicHasKey: false, anthropicMasked: '' }));
                        setApiKeySaveStatus(prev => ({ ...prev, anthropic: 'removed' }));
                        setTimeout(() => setApiKeySaveStatus(prev => ({ ...prev, anthropic: '' })), 2000);
                      }
                    }}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeys.anthropic}
                    onChange={(e) => handleApiKeyChange('anthropic', e.target.value)}
                    placeholder="sk-ant-..."
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={async () => {
                      if (window.electronAPI?.setApiKey && apiKeys.anthropic) {
                        const result = await window.electronAPI.setApiKey('anthropic', apiKeys.anthropic);
                        if (result.success) {
                          setApiKeys(prev => ({
                            ...prev,
                            anthropic: '',
                            anthropicHasKey: true,
                            anthropicMasked: result.masked
                          }));
                          setApiKeySaveStatus(prev => ({ ...prev, anthropic: 'saved' }));
                          setTimeout(() => setApiKeySaveStatus(prev => ({ ...prev, anthropic: '' })), 2000);
                        }
                      }
                    }}
                    disabled={!apiKeys.anthropic}
                    className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <Shield size={18} />
                  </button>
                </div>
              )}
              {apiKeySaveStatus.anthropic && (
                <p className={`mt-1 text-xs ${apiKeySaveStatus.anthropic === 'saved' ? 'text-green-400' : 'text-red-400'}`}>
                  {apiKeySaveStatus.anthropic === 'saved' ? 'Key guardada de forma segura' : 'Key eliminada'}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Necesario para procesamiento con Claude (recomendado para español).
              </p>
            </div>

            <div className="p-4 bg-slate-700/50 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Obtener API Keys</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• OpenAI: <a href="https://platform.openai.com/api-keys" className="text-blue-400 hover:underline" target="_blank" rel="noopener">platform.openai.com/api-keys</a></li>
                <li>• Anthropic: <a href="https://console.anthropic.com" className="text-blue-400 hover:underline" target="_blank" rel="noopener">console.anthropic.com</a></li>
              </ul>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
                <Shield size={16} />
                Seguridad de las API Keys
              </h4>
              <p className="text-xs text-slate-400">
                Tus API keys se almacenan de forma cifrada usando la protección del sistema operativo
                (Windows Credential Manager, macOS Keychain, o Linux Secret Service).
                Las keys nunca se guardan en texto plano ni se envían a servidores externos.
              </p>
            </div>
          </div>
        );

      case TABS.HOTKEY:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Hotkey actual
              </label>
              <div className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono text-lg">
                {formatHotkeyDisplay(currentHotkey)}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Presiona este atajo de teclado para iniciar/detener la grabación desde cualquier aplicación.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Cambiar hotkey
              </label>
              <select
                value={currentHotkey}
                onChange={(e) => changeHotkey(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableHotkeys.map((hk) => (
                  <option key={hk} value={hk}>
                    {formatHotkeyDisplay(hk)}
                  </option>
                ))}
              </select>

              {/* Status message */}
              {hotkeyStatus.message && (
                <p className={`mt-2 text-sm ${
                  hotkeyStatus.type === 'success' ? 'text-green-400' :
                  hotkeyStatus.type === 'error' ? 'text-red-400' :
                  'text-blue-400'
                }`}>
                  {hotkeyStatus.message}
                </p>
              )}
            </div>

            {/* Custom hotkey input */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                O ingresa un hotkey personalizado
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customHotkey}
                  onChange={(e) => setCustomHotkey(e.target.value)}
                  placeholder="Ej: CommandOrControl+Alt+D"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <button
                  onClick={() => {
                    if (customHotkey.trim()) {
                      changeHotkey(customHotkey.trim());
                    }
                  }}
                  disabled={!customHotkey.trim()}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Aplicar
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Formato: CommandOrControl, Control, Alt, Shift + letras/números/F1-F12
              </p>
            </div>

            <div className="p-4 bg-slate-700/50 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Cómo usar</h4>
              <ol className="text-xs text-slate-400 space-y-2">
                <li>1. Presiona <kbd className="bg-slate-600 px-1 rounded">{formatHotkeyDisplay(currentHotkey)}</kbd> para empezar a grabar</li>
                <li>2. Habla tu texto claramente</li>
                <li>3. Presiona <kbd className="bg-slate-600 px-1 rounded">{formatHotkeyDisplay(currentHotkey)}</kbd> de nuevo para detener</li>
                <li>4. El texto se pegará automáticamente en la aplicación activa</li>
              </ol>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <h4 className="text-sm font-medium text-amber-400 mb-2">⚠️ Nota importante</h4>
              <p className="text-xs text-slate-400">
                Algunos atajos pueden estar ocupados por otras aplicaciones o el sistema operativo.
                Si el hotkey no funciona, prueba con otra combinación.
              </p>
            </div>
          </div>
        );

      case TABS.HISTORY:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Historial de transcripciones</h3>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    onClick={() => {
                      // Export as CSV
                      const csv = history.map(t =>
                        `"${t.timestamp}","${(t.processed_text || t.original_text || '').replace(/"/g, '""')}","${t.processing_method || 'none'}"`
                      ).join('\n');
                      const csvContent = `"Fecha","Texto","Modo"\n${csv}`;
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `murmullo-historial-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded"
                  >
                    <Download size={12} />
                    Exportar CSV
                  </button>
                )}
                <button
                  onClick={loadHistory}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Actualizar
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <History size={48} className="mx-auto mb-2 opacity-50" />
                <p>No hay transcripciones aún</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {history.map((item) => (
                  <div key={item.id} className="bg-slate-700/50 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-white flex-1">
                        {item.processed_text || item.original_text}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                      <span>{formatDate(item.timestamp)}</span>
                      {item.is_processed && (
                        <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                          {item.processing_method}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case TABS.STATS:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200">Estadísticas de uso</h3>

            {/* Main stats grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="text-blue-400" size={24} />
                  <span className="text-slate-400 text-sm">Total transcripciones</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.totalTranscriptions}</p>
              </div>

              <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <BarChart3 className="text-green-400" size={24} />
                  <span className="text-slate-400 text-sm">Total palabras</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.totalWords.toLocaleString()}</p>
              </div>

              <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="text-purple-400" size={24} />
                  <span className="text-slate-400 text-sm">Tiempo de tipeo ahorrado</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.estimatedTypingTimeSaved} min</p>
                <p className="text-xs text-slate-500 mt-1">Basado en 40 palabras/minuto</p>
              </div>

              <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="text-amber-400" size={24} />
                  <span className="text-slate-400 text-sm">Promedio por transcripción</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats.avgWordsPerTranscription}</p>
                <p className="text-xs text-slate-500 mt-1">palabras</p>
              </div>
            </div>

            {/* Today and this week */}
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
              <h4 className="text-sm font-medium text-slate-300">Actividad reciente</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">Hoy</p>
                  <p className="text-xl font-semibold text-white">{stats.todayTranscriptions} transcripciones</p>
                  <p className="text-sm text-slate-500">{stats.todayWords} palabras</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Esta semana</p>
                  <p className="text-xl font-semibold text-white">{stats.thisWeekWords.toLocaleString()}</p>
                  <p className="text-sm text-slate-500">palabras</p>
                </div>
              </div>
            </div>

            {/* Mode usage */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3">Uso de modos</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Modo Inteligente</span>
                    <span className="text-slate-300">{stats.smartModeUsage}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${stats.smartModeUsage}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Modo Rápido</span>
                    <span className="text-slate-300">{stats.fastModeUsage}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${stats.fastModeUsage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cost estimation */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <DollarSign size={16} className="text-green-400" />
                Costo estimado de uso
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Whisper (transcripción)</span>
                  <span className="text-slate-300">${stats.estimatedCost.whisper.toFixed(4)} USD</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Claude Haiku (procesamiento)</span>
                  <span className="text-slate-300">${stats.estimatedCost.claude.toFixed(4)} USD</span>
                </div>
                <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between text-sm font-medium">
                  <span className="text-slate-300">Total estimado</span>
                  <span className="text-green-400">${stats.estimatedCost.total.toFixed(4)} USD</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  ~{stats.estimatedAudioMinutes} minutos de audio procesados
                </p>
              </div>
            </div>

            {/* Refresh button */}
            <button
              onClick={loadHistory}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Actualizar estadísticas
            </button>
          </div>
        );

      case TABS.UPDATES:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200">Actualizaciones</h3>

            {/* Current version */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Versión actual</p>
                  <p className="text-xl font-bold text-white">v{updateStatus.currentVersion}</p>
                </div>
                <button
                  onClick={checkForUpdates}
                  disabled={updateStatus.status === 'checking' || updateStatus.status === 'downloading'}
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw size={16} className={updateStatus.status === 'checking' ? 'animate-spin' : ''} />
                  {updateStatus.status === 'checking' ? 'Buscando...' : 'Buscar actualizaciones'}
                </button>
              </div>
            </div>

            {/* Update status */}
            {updateStatus.status === 'not-available' && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="text-green-400" size={24} />
                <div>
                  <p className="font-medium text-green-400">Estás al día</p>
                  <p className="text-sm text-slate-400">No hay actualizaciones disponibles.</p>
                </div>
              </div>
            )}

            {updateStatus.status === 'available' && !updateStatus.updateDownloaded && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <ArrowDownCircle className="text-blue-400" size={24} />
                  <div>
                    <p className="font-medium text-blue-400">Nueva versión disponible</p>
                    <p className="text-sm text-slate-400">v{updateStatus.version}</p>
                  </div>
                </div>
                <button
                  onClick={downloadUpdate}
                  className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg transition-colors"
                >
                  <Download size={18} />
                  Descargar actualización
                </button>
              </div>
            )}

            {updateStatus.status === 'downloading' && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <Loader2 className="text-blue-400 animate-spin" size={24} />
                  <div>
                    <p className="font-medium text-blue-400">Descargando actualización...</p>
                    <p className="text-sm text-slate-400">{updateStatus.downloadProgress}% completado</p>
                  </div>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${updateStatus.downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {updateStatus.status === 'downloaded' && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle2 className="text-green-400" size={24} />
                  <div>
                    <p className="font-medium text-green-400">Actualización lista</p>
                    <p className="text-sm text-slate-400">v{updateStatus.version} descargada. Reinicia para instalar.</p>
                  </div>
                </div>
                <button
                  onClick={installUpdate}
                  className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg transition-colors"
                >
                  <RefreshCw size={18} />
                  Reiniciar e instalar
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  La aplicación se cerrará y se instalará la actualización automáticamente.
                </p>
              </div>
            )}

            {updateStatus.status === 'error' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                <XCircle className="text-red-400" size={24} />
                <div>
                  <p className="font-medium text-red-400">Error al buscar actualizaciones</p>
                  <p className="text-sm text-slate-400">{updateStatus.error || 'Error desconocido'}</p>
                </div>
              </div>
            )}

            {/* Auto-update info */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <Info size={16} className="text-blue-400" />
                Información sobre actualizaciones
              </h4>
              <ul className="text-sm text-slate-400 space-y-2">
                <li>• Las actualizaciones se buscan automáticamente cada 4 horas.</li>
                <li>• Puedes descargar e instalar manualmente desde esta pestaña.</li>
                <li>• Las actualizaciones se publican en <a href="https://github.com/jorgecepe/Murmullo/releases" target="_blank" rel="noopener" className="text-blue-400 hover:underline">GitHub Releases</a>.</li>
              </ul>
            </div>
          </div>
        );

      case TABS.LOGS:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-slate-200">Logs de la aplicación</h3>
              <button
                onClick={loadLogFiles}
                disabled={loadingLogs}
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loadingLogs ? 'animate-spin' : ''} />
                Actualizar
              </button>
            </div>

            <p className="text-sm text-slate-400">
              Los logs contienen información de uso y errores que ayudan a mejorar la aplicación.
              No incluyen contenido de tus transcripciones, solo metadatos (tiempos, conteo de palabras).
            </p>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportLogs}
                className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Download size={16} />
                Exportar todos los logs
              </button>
              <button
                onClick={openLogsFolder}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <FolderOpen size={16} />
                Abrir carpeta de logs
              </button>
              <button
                onClick={() => clearOldLogs(30)}
                className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
                Limpiar logs antiguos (+30 días)
              </button>
            </div>

            {/* Log files list */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <ScrollText size={16} className="text-blue-400" />
                Archivos de log
              </h4>

              {logFiles.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <ScrollText size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay archivos de log</p>
                  <button
                    onClick={loadLogFiles}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    Cargar archivos
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {logFiles.map((file) => (
                    <div
                      key={file.name}
                      className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3 cursor-pointer hover:bg-slate-700 transition-colors"
                      onClick={() => readLogFile(file.name)}
                    >
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-slate-400" />
                        <div>
                          <p className="text-sm text-white">{file.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(file.size)} • {new Date(file.modified).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-blue-400">Ver</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected log content */}
            {selectedLogContent && (
              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-300">{selectedLogContent.filename}</h4>
                  <button
                    onClick={() => setSelectedLogContent(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
                <pre className="bg-slate-900 rounded-lg p-3 text-xs text-slate-300 overflow-auto max-h-[300px] font-mono whitespace-pre-wrap">
                  {selectedLogContent.content}
                </pre>
              </div>
            )}

            {/* Info about logs location */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Ubicación de los logs</h4>
              <p className="text-xs text-slate-400 font-mono bg-slate-900 p-2 rounded">
                %APPDATA%\murmullo\logs\
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Los logs se guardan automáticamente por día y contienen información útil para diagnóstico.
              </p>
            </div>
          </div>
        );

      case TABS.HELP:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200">Ayuda y Costos</h3>

            {/* Pricing info */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <DollarSign size={16} className="text-green-400" />
                Precios de las APIs (Enero 2026)
              </h4>

              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-medium text-blue-400 mb-2">OpenAI Whisper (Transcripción)</h5>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-sm text-slate-300">$0.006 USD por minuto de audio</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Ejemplo: 10 minutos de audio = $0.06 USD
                    </p>
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-medium text-purple-400 mb-2">Anthropic Claude Haiku (Procesamiento)</h5>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-sm text-slate-300">$0.25 USD / 1M tokens entrada</p>
                    <p className="text-sm text-slate-300">$1.25 USD / 1M tokens salida</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Ejemplo: 1000 palabras ≈ 1300 tokens ≈ $0.002 USD
                    </p>
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-medium text-emerald-400 mb-2">OpenAI GPT-4o Mini (Alternativa)</h5>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-sm text-slate-300">$0.15 USD / 1M tokens entrada</p>
                    <p className="text-sm text-slate-300">$0.60 USD / 1M tokens salida</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost example */}
            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/30 rounded-xl p-4">
              <h4 className="text-sm font-medium text-green-400 mb-2">💡 Ejemplo de uso típico</h4>
              <p className="text-sm text-slate-300">
                Una sesión de trabajo de 1 hora con ~20 transcripciones (~15 minutos de audio total):
              </p>
              <ul className="text-sm text-slate-400 mt-2 space-y-1">
                <li>• Whisper: 15 min × $0.006 = <span className="text-green-400">$0.09 USD</span></li>
                <li>• Claude Haiku: ~3000 tokens = <span className="text-green-400">$0.005 USD</span></li>
                <li>• <strong className="text-white">Total: ~$0.10 USD por hora de uso intensivo</strong></li>
              </ul>
            </div>

            {/* Links */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <ExternalLink size={16} className="text-blue-400" />
                Enlaces útiles
              </h4>
              <div className="space-y-2">
                <a
                  href="https://openai.com/api/pricing/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline"
                >
                  <ExternalLink size={14} />
                  Precios de OpenAI (Whisper y GPT)
                </a>
                <a
                  href="https://www.anthropic.com/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline"
                >
                  <ExternalLink size={14} />
                  Precios de Anthropic (Claude)
                </a>
                <a
                  href="https://platform.openai.com/usage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline"
                >
                  <ExternalLink size={14} />
                  Ver uso en OpenAI Dashboard
                </a>
                <a
                  href="https://console.anthropic.com/settings/usage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline"
                >
                  <ExternalLink size={14} />
                  Ver uso en Anthropic Console
                </a>
              </div>
            </div>

            {/* About */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <Info size={16} className="text-blue-400" />
                Acerca de Murmullo
              </h4>
              <p className="text-sm text-slate-400">
                Murmullo es una aplicación de dictado de voz para desarrolladores hispanohablantes.
                Transcribe tu voz en español preservando términos técnicos en inglés como git, commit, deploy, API, etc.
              </p>

              <div className="mt-4 p-3 bg-slate-700/50 rounded-lg">
                <p className="text-sm text-slate-300">
                  <span className="font-medium">Versión:</span> {appInfo.version}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Electron {appInfo.electron} • Node {appInfo.node}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <a
                  href="https://github.com/jorgecepe/Murmullo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <Github size={16} />
                  Repositorio en GitHub
                </a>
                <a
                  href="https://github.com/jorgecepe/Murmullo/blob/main/CHANGELOG.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ScrollText size={16} />
                  Ver historial de cambios (Changelog)
                </a>
                <a
                  href="https://github.com/jorgecepe/Murmullo/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink size={16} />
                  Reportar un problema
                </a>
              </div>

              <p className="text-xs text-slate-500 mt-4">
                Fork de Open-Whispr • Hecho con ❤️ para desarrolladores
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <h1 className="text-xl font-semibold">Murmullo - Configuración</h1>
        <button
          onClick={closePanel}
          className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <div className="w-56 border-r border-slate-700 p-4">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab(TABS.GENERAL)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.GENERAL
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Settings size={18} />
              General
            </button>
            <button
              onClick={() => setActiveTab(TABS.ACCOUNT)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.ACCOUNT
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {backendMode ? <Cloud size={18} /> : <CloudOff size={18} />}
              Cuenta
              {backendMode && backendStatus === 'online' && (
                <span className="ml-auto w-2 h-2 bg-green-500 rounded-full"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab(TABS.API_KEYS)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.API_KEYS
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Key size={18} />
              API Keys
            </button>
            <button
              onClick={() => setActiveTab(TABS.HOTKEY)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.HOTKEY
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Keyboard size={18} />
              Hotkey
            </button>
            <button
              onClick={() => setActiveTab(TABS.HISTORY)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.HISTORY
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <History size={18} />
              Historial
            </button>
            <button
              onClick={() => setActiveTab(TABS.STATS)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.STATS
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <BarChart3 size={18} />
              Estadísticas
            </button>
            <button
              onClick={() => setActiveTab(TABS.UPDATES)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.UPDATES
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ArrowDownCircle size={18} />
              Actualizaciones
              {updateStatus.updateAvailable && !updateStatus.updateDownloaded && (
                <span className="ml-auto w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              )}
              {updateStatus.updateDownloaded && (
                <span className="ml-auto w-2 h-2 bg-green-500 rounded-full"></span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab(TABS.LOGS); loadLogFiles(); }}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.LOGS
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ScrollText size={18} />
              Logs
            </button>
            <button
              onClick={() => setActiveTab(TABS.HELP)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                activeTab === TABS.HELP
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <HelpCircle size={18} />
              Ayuda
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-2xl">
            {renderTabContent()}

            {/* Save button (not shown in history, stats, updates, logs, or help tabs) */}
            {activeTab !== TABS.HISTORY && activeTab !== TABS.STATS && activeTab !== TABS.UPDATES && activeTab !== TABS.LOGS && activeTab !== TABS.HELP && (
              <div className="mt-8 flex items-center gap-4">
                <button
                  onClick={saveSettings}
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  <Save size={18} />
                  Guardar cambios
                </button>
                {saved && (
                  <span className="text-green-400 text-sm">Guardado</span>
                )}
                {autoSaving && !saved && (
                  <span className="text-slate-400 text-sm flex items-center gap-1">
                    <CheckCircle2 size={14} className="text-green-400" />
                    Auto-guardado
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// Wrap with ErrorBoundary for better error handling
function ControlPanelWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <ControlPanel />
    </ErrorBoundary>
  );
}

export default ControlPanelWithErrorBoundary;

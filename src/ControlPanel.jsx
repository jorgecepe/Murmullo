import React, { useState, useEffect } from 'react';
import { Settings, History, Key, Keyboard, X, Save, Trash2, BarChart3, Clock, FileText, Zap, HelpCircle, DollarSign, ExternalLink, FolderOpen, Download, ScrollText, RefreshCw, Github, Info } from 'lucide-react';

const TABS = {
  GENERAL: 'general',
  API_KEYS: 'api-keys',
  HOTKEY: 'hotkey',
  HISTORY: 'history',
  STATS: 'stats',
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
    reasoningModel: 'claude-3-haiku-20240307'
  });
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    anthropic: ''
  });
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

  // Load settings on mount
  useEffect(() => {
    const loadedSettings = {
      language: localStorage.getItem('language') || 'es',
      processingMode: localStorage.getItem('processingMode') || 'smart',
      reasoningProvider: localStorage.getItem('reasoningProvider') || 'anthropic',
      reasoningModel: localStorage.getItem('reasoningModel') || 'claude-3-haiku-20240307'
    };
    setSettings(loadedSettings);

    // Load API keys
    const loadedKeys = {
      openai: localStorage.getItem('openaiKey') || '',
      anthropic: localStorage.getItem('anthropicKey') || ''
    };
    setApiKeys(loadedKeys);

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
  }, []);

  const loadHistory = async () => {
    if (window.electronAPI) {
      const transcriptions = await window.electronAPI.getTranscriptions(500); // Get more for stats
      setHistory(transcriptions);
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

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
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
          </div>
        );

      case TABS.API_KEYS:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={apiKeys.openai}
                onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                placeholder="sk-..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                Necesario para transcripción con Whisper y procesamiento con GPT.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Anthropic API Key
              </label>
              <input
                type="password"
                value={apiKeys.anthropic}
                onChange={(e) => handleApiKeyChange('anthropic', e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
              <button
                onClick={loadHistory}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Actualizar
              </button>
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

            {/* Save button (not shown in history, stats, logs, or help tabs) */}
            {activeTab !== TABS.HISTORY && activeTab !== TABS.STATS && activeTab !== TABS.LOGS && activeTab !== TABS.HELP && (
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ControlPanel;

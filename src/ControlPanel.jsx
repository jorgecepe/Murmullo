import React, { useState, useEffect } from 'react';
import { Settings, History, Key, Keyboard, X, Save, Trash2 } from 'lucide-react';

const TABS = {
  GENERAL: 'general',
  API_KEYS: 'api-keys',
  HOTKEY: 'hotkey',
  HISTORY: 'history'
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
  }, []);

  const loadHistory = async () => {
    if (window.electronAPI) {
      const transcriptions = await window.electronAPI.getTranscriptions(50);
      setHistory(transcriptions);
    }
  };

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
              <div className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono">
                Ctrl + Shift + Space
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Presiona este atajo de teclado para iniciar/detener la grabación desde cualquier aplicación.
              </p>
            </div>

            <div className="p-4 bg-slate-700/50 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Cómo usar</h4>
              <ol className="text-xs text-slate-400 space-y-2">
                <li>1. Presiona <kbd className="bg-slate-600 px-1 rounded">Ctrl+Shift+Space</kbd> para empezar a grabar</li>
                <li>2. Habla tu texto claramente</li>
                <li>3. Presiona <kbd className="bg-slate-600 px-1 rounded">Ctrl+Shift+Space</kbd> de nuevo para detener</li>
                <li>4. El texto se pegará automáticamente en la aplicación activa</li>
              </ol>
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
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-2xl">
            {renderTabContent()}

            {/* Save button (not shown in history tab) */}
            {activeTab !== TABS.HISTORY && (
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

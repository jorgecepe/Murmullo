import React, { useState, useCallback } from 'react';
import { Mic, Key, Cloud, CheckCircle2, XCircle, Loader2, ArrowRight, Shield } from 'lucide-react';

/**
 * WelcomeModal
 *
 * First-run onboarding. Shown once to users who haven't completed setup
 * (tracked via localStorage 'hasCompletedOnboarding'). Three steps:
 *
 *   1. Greeting + explain what Murmullo does and the default hotkey.
 *   2. Ask user to choose a path:
 *       - BYOK: paste an OpenAI API key. Validated live via
 *         window.electronAPI.validateApiKey before storage.
 *       - Backend: create/login to a managed subscription (deferred;
 *         shows "próximamente" if backend is unreachable).
 *       - Skip: start with the 30-minute free trial using a demo.
 *         (Only available if a demo flow is configured; otherwise hidden.)
 *   3. Confirmation + "puedes cambiar esto luego en el Panel de control".
 *
 * This is isolated from ControlPanel state to keep the flow simple and
 * debuggable. Parent owns open/close and the localStorage flag.
 */
export default function WelcomeModal({ open, onComplete, onDismiss }) {
  const [step, setStep] = useState(0);
  const [path, setPath] = useState(null); // 'byok' | 'backend' | 'trial'
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null); // 'ok' | 'bad' | 'error'
  const [validationMessage, setValidationMessage] = useState('');

  const resetState = () => {
    setStep(0);
    setPath(null);
    setApiKey('');
    setValidating(false);
    setValidationResult(null);
    setValidationMessage('');
  };

  const validateAndSave = useCallback(async () => {
    if (!apiKey.startsWith('sk-')) {
      setValidationResult('bad');
      setValidationMessage('La clave debe empezar con "sk-".');
      return;
    }
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await window.electronAPI.validateApiKey('openai', apiKey);
      if (!result?.success) {
        setValidationResult('error');
        setValidationMessage(result?.message || 'No se pudo validar en este momento. Intenta de nuevo.');
        setValidating(false);
        return;
      }
      if (!result.valid) {
        setValidationResult('bad');
        setValidationMessage(result.reason === 'unauthorized'
          ? 'OpenAI rechazó la clave. Revisa que esté activa y tenga crédito.'
          : 'La clave no pasó la validación.');
        setValidating(false);
        return;
      }
      // Valid: persist via secure storage and also mirror to localStorage for compatibility.
      await window.electronAPI.setApiKey('openai', apiKey);
      localStorage.setItem('openaiKey', apiKey);
      setValidationResult('ok');
      setValidationMessage('Clave verificada. Todo listo.');
      setValidating(false);
      // Advance to confirmation
      setTimeout(() => setStep(2), 800);
    } catch (err) {
      setValidationResult('error');
      setValidationMessage(err.message || 'Error inesperado.');
      setValidating(false);
    }
  }, [apiKey]);

  const finish = useCallback(() => {
    localStorage.setItem('hasCompletedOnboarding', 'true');
    resetState();
    onComplete?.();
  }, [onComplete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Mic className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Bienvenido a Murmullo</h2>
            <p className="text-xs text-slate-400">Configuración inicial (3 pasos)</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-blue-500' : 'bg-slate-700'}`}
            />
          ))}
        </div>

        {/* Step 0: intro */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Murmullo convierte lo que dictas en texto limpio y lo pega donde estés escribiendo. Preserva términos técnicos en inglés (git, deploy, API, etc.).
            </p>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-slate-300 mb-1">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="font-medium">Todo es local por defecto</span>
              </div>
              <p className="text-slate-400 text-xs">
                El audio solo se envía a OpenAI o Anthropic cuando pulsas el hotkey. Sin telemetría automática.
              </p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
              <div className="text-slate-300 mb-1 font-medium">Hotkey por defecto</div>
              <code className="text-blue-400 text-xs">Ctrl + Shift + Space</code>
              <p className="text-slate-400 text-xs mt-1">
                Púlsalo para grabar; púlsalo otra vez para detener y pegar. Puedes cambiarlo en el panel.
              </p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 1: choose path */}
        {step === 1 && !path && (
          <div className="space-y-3">
            <p className="text-slate-300 text-sm mb-4">¿Cómo quieres usar Murmullo?</p>

            <button
              onClick={() => setPath('byok')}
              className="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-medium">Tengo mi propia API key de OpenAI</div>
                  <div className="text-slate-400 text-xs mt-1">
                    Sin límites de Murmullo. Pagas directo a OpenAI (~$0.006 por minuto).
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setPath('trial')}
              className="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-medium">Quiero probar gratis (30 minutos)</div>
                  <div className="text-slate-400 text-xs mt-1">
                    Murmullo cubre los primeros 30 min. Luego necesitas tu key o un plan.
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setPath('backend')}
              className="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-medium">Suscripción gestionada</div>
                  <div className="text-slate-400 text-xs mt-1">
                    Sin API keys, cuota ampliada. (Disponible en el panel de cuenta.)
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step 1 (cont): BYOK key entry */}
        {step === 1 && path === 'byok' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Pega tu API key de OpenAI
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setValidationResult(null); }}
                placeholder="sk-..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-400">
                Se valida en vivo contra OpenAI antes de guardarse. Se almacena cifrada con el sistema operativo.
              </p>
            </div>

            {validationResult === 'ok' && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" /> {validationMessage}
              </div>
            )}
            {(validationResult === 'bad' || validationResult === 'error') && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <XCircle className="w-4 h-4" /> {validationMessage}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setPath(null); setApiKey(''); setValidationResult(null); }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Atrás
              </button>
              <button
                onClick={validateAndSave}
                disabled={validating || !apiKey}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {validating ? <><Loader2 className="w-4 h-4 animate-spin" /> Validando...</> : <>Verificar y guardar</>}
              </button>
            </div>
            <p className="text-xs text-slate-500 text-center">
              ¿No tienes una? <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Créala en OpenAI</a>.
            </p>
          </div>
        )}

        {/* Step 1 (cont): trial or backend -> advance directly */}
        {step === 1 && (path === 'trial' || path === 'backend') && (
          <div className="space-y-4">
            {path === 'trial' && (
              <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="text-amber-300 font-medium">Prueba gratuita de 30 minutos</div>
                    <p className="text-slate-400 text-xs mt-1">
                      Si aún no hay una clave demo disponible, el primer uso te pedirá tu propia API key. El contador de 30 min empieza en cero.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {path === 'backend' && (
              <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Cloud className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="text-emerald-300 font-medium">Suscripción gestionada</div>
                    <p className="text-slate-400 text-xs mt-1">
                      Abre el Panel de control → Cuenta para crear tu cuenta y elegir plan.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setPath(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                Entendido <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: confirmation */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Todo listo</span>
            </div>
            <p className="text-slate-300 text-sm">
              Cierra esta ventana y pulsa <code className="text-blue-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">Ctrl + Shift + Space</code> para empezar a dictar.
            </p>
            <p className="text-slate-400 text-xs">
              Puedes cambiar cualquier preferencia en el Panel de control en cualquier momento.
            </p>
            <button
              onClick={finish}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg transition-colors"
            >
              Empezar a usar Murmullo
            </button>
          </div>
        )}

        {/* Dismiss link */}
        {step < 2 && (
          <button
            onClick={() => { localStorage.setItem('hasCompletedOnboarding', 'true'); onDismiss?.(); }}
            className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Omitir y configurar manualmente
          </button>
        )}
      </div>
    </div>
  );
}

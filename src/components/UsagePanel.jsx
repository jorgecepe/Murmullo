import React, { useEffect, useState, useCallback } from 'react';
import { Zap, Key, CreditCard, AlertTriangle, CheckCircle2, Infinity as InfinityIcon } from 'lucide-react';

/**
 * UsagePanel
 *
 * Shows the user's free-tier consumption and the next step when exhausted.
 *
 * Reads from window.electronAPI.getUsage() which returns:
 *   { summary, gate, backendAuthenticated }
 *
 * Three visual states:
 *   1. Backend-authenticated or BYOK (own API key)
 *      -> "Sin límite" green card, no progress bar.
 *   2. Free tier in progress (secondsUsed < limit)
 *      -> Progress bar + "X de 30 min usados" copy.
 *   3. Free tier exhausted
 *      -> Red card with CTA: add own key or upgrade plan.
 *
 * Designed to be dropped at the top of any ControlPanel tab; parent passes
 * onGoToApiKeys and onGoToAccount callbacks so the CTAs can route tabs.
 */
export default function UsagePanel({ onGoToApiKeys, onGoToAccount }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.electronAPI?.getUsage) {
      setError('API no disponible');
      setLoading(false);
      return;
    }
    try {
      const res = await window.electronAPI.getUsage();
      if (!res?.success) {
        setError(res?.error || 'Error desconocido');
      } else {
        setState(res);
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-fetch every 15s so the counter updates when the floating window
    // transcribes while the panel is open.
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-6 text-slate-400 text-sm">
        Cargando estado de cuenta...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6 text-red-300 text-sm">
        <AlertTriangle className="inline w-4 h-4 mr-2" />
        No se pudo cargar el estado de uso: {error}
      </div>
    );
  }

  if (!state) return null;

  const { summary, gate, backendAuthenticated } = state;
  const hasOwnKey = summary.hasOwnApiKey;
  const minutesUsed = (summary.totalSeconds / 60).toFixed(1);
  const limitMin = summary.freeTierMinutes;
  const percent = Math.min(100, Math.max(0, gate.percent || 0));

  // State 1: unlimited (backend or BYOK)
  if (backendAuthenticated || hasOwnKey) {
    const label = backendAuthenticated ? 'Plan activo en el servidor' : 'Usando tu propia API key';
    const sub = backendAuthenticated
      ? 'El límite lo aplica el backend según tu plan.'
      : 'No hay límite impuesto por Murmullo; pagas directamente a tu proveedor.';
    return (
      <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4 mb-6 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-emerald-300 font-medium">
            <InfinityIcon className="w-4 h-4" />
            {label}
          </div>
          <p className="text-slate-400 text-xs mt-1">{sub}</p>
          <p className="text-slate-500 text-xs mt-2">
            Minutos transcritos en este dispositivo: {minutesUsed} ({summary.transcriptionCount} transcripciones).
          </p>
        </div>
      </div>
    );
  }

  // State 2+3: free tier tracking
  const exhausted = !gate.allowed;
  const nearLimit = !exhausted && percent >= 80;

  const barColor = exhausted
    ? 'bg-red-500'
    : nearLimit
      ? 'bg-amber-500'
      : 'bg-blue-500';

  const borderColor = exhausted
    ? 'border-red-700'
    : nearLimit
      ? 'border-amber-700'
      : 'border-slate-700';

  const bgColor = exhausted
    ? 'bg-red-900/20'
    : nearLimit
      ? 'bg-amber-900/20'
      : 'bg-slate-800/50';

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-4 mb-6`}>
      <div className="flex items-center gap-2 mb-2">
        <Zap className={`w-5 h-5 ${exhausted ? 'text-red-400' : nearLimit ? 'text-amber-400' : 'text-blue-400'}`} />
        <h3 className="font-medium text-white">
          {exhausted ? 'Plan gratuito agotado' : 'Plan gratuito'}
        </h3>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-300 mb-1">
        <span>{minutesUsed} / {limitMin} min</span>
        <span className="text-slate-400 text-xs">{percent.toFixed(0)}%</span>
      </div>

      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {exhausted ? (
        <div className="mt-4 space-y-3">
          <p className="text-red-300 text-sm">
            Alcanzaste los {limitMin} minutos de prueba gratuita. Para seguir
            transcribiendo elige una opción:
          </p>
          <div className="grid md:grid-cols-2 gap-2">
            <button
              onClick={onGoToApiKeys}
              className="flex items-start gap-2 text-left p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <Key className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-white text-sm font-medium">Usa tu propia API key</div>
                <div className="text-slate-400 text-xs">Gratuito en Murmullo; pagas directo a OpenAI.</div>
              </div>
            </button>
            <button
              onClick={onGoToAccount}
              className="flex items-start gap-2 text-left p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <CreditCard className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-white text-sm font-medium">Suscribirse a un plan</div>
                <div className="text-slate-400 text-xs">Sin gestionar API keys; cuota ampliada.</div>
              </div>
            </button>
          </div>
        </div>
      ) : nearLimit ? (
        <p className="mt-3 text-amber-300 text-xs">
          Te quedan {(gate.secondsRemaining / 60).toFixed(1)} minutos. Considera añadir tu propia API key o contratar un plan antes de agotar la prueba.
        </p>
      ) : (
        <p className="mt-3 text-slate-400 text-xs">
          Te quedan {(gate.secondsRemaining / 60).toFixed(1)} minutos de prueba gratuita.
        </p>
      )}
    </div>
  );
}

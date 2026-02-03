import React, { useState } from 'react';
import { X, Mail, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

export function AuthModal({ isOpen, onClose, onSuccess, apiClient }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        result = await apiClient.login(email, password);
      } else {
        result = await apiClient.register(email, password, name);
      }
      onSuccess(result.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1b26] rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#2a2b3d] text-white pl-10 pr-4 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Tu nombre"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#2a2b3d] text-white pl-10 pr-4 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="tu@email.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Contraseña</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full bg-[#2a2b3d] text-white pl-10 pr-4 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white py-2 rounded font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </button>

          <div className="text-center text-sm text-gray-400">
            {mode === 'login' ? (
              <>
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-blue-400 hover:underline"
                >
                  Regístrate
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-blue-400 hover:underline"
                >
                  Inicia sesión
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default AuthModal;

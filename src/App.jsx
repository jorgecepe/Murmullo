import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Settings, Check, AlertCircle, Loader2 } from 'lucide-react';

// Status states
const STATUS = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error'
};

function App() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastText, setLastText] = useState('');
  const [settings, setSettings] = useState({
    processingMode: 'smart',
    language: 'es',
    reasoningProvider: 'anthropic',
    openaiKey: '',
    anthropicKey: ''
  });

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Cleanup function to properly release audio resources
  const cleanupAudioResources = useCallback(() => {
    console.log('[App] Cleaning up audio resources...');

    // Stop MediaRecorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        console.log('[App] MediaRecorder stopped during cleanup');
      } catch (e) {
        console.log('[App] MediaRecorder already stopped');
      }
    }
    mediaRecorderRef.current = null;

    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[App] Audio track stopped:', track.label);
      });
      streamRef.current = null;
    }

    // Clear audio chunks
    audioChunksRef.current = [];
  }, []);

  // Cleanup on unmount and before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[App] Window unloading, cleaning up...');
      cleanupAudioResources();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupAudioResources();
    };
  }, [cleanupAudioResources]);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = {
      processingMode: localStorage.getItem('processingMode') || 'smart',
      language: localStorage.getItem('language') || 'es',
      reasoningProvider: localStorage.getItem('reasoningProvider') || 'anthropic',
      openaiKey: localStorage.getItem('openaiKey') || '',
      anthropicKey: localStorage.getItem('anthropicKey') || ''
    };
    setSettings(savedSettings);
    console.log('[App] Settings loaded:', {
      ...savedSettings,
      openaiKey: savedSettings.openaiKey ? 'SET' : 'NOT SET',
      anthropicKey: savedSettings.anthropicKey ? 'SET' : 'NOT SET'
    });
  }, []);

  // Handle hotkey toggle
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onToggleDictation(() => {
      console.log('[App] Hotkey triggered, current status:', status);
      if (status === STATUS.IDLE) {
        startRecording();
      } else if (status === STATUS.RECORDING) {
        stopRecording();
      }
    });

    return () => unsubscribe();
  }, [status]);

  const startRecording = useCallback(async () => {
    console.log('[App] Starting recording...');

    // Always cleanup previous resources before starting a new recording
    // This prevents the MediaRecorder from being in a corrupted state
    cleanupAudioResources();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      console.log('[App] Got audio stream, tracks:', stream.getAudioTracks().length);
      streamRef.current = stream;

      // Try different mimeTypes for compatibility - prefer formats Whisper supports
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        '' // fallback to browser default
      ];

      let selectedMimeType = '';
      for (const mt of mimeTypes) {
        if (!mt || MediaRecorder.isTypeSupported(mt)) {
          selectedMimeType = mt;
          break;
        }
      }
      console.log('[App] Selected mimeType:', selectedMimeType || 'browser default');
      console.log('[App] Supported mimeTypes:', mimeTypes.filter(mt => !mt || MediaRecorder.isTypeSupported(mt)));

      const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      console.log('[App] MediaRecorder created, actual mimeType:', mediaRecorder.mimeType);

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('[App] Audio data available, size:', event.data.size);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[App] MediaRecorder stopped, chunks:', audioChunksRef.current.length);
        const actualMimeType = mediaRecorder.mimeType || 'audio/webm';
        console.log('[App] Using mimeType for blob:', actualMimeType);
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        console.log('[App] Audio blob created, size:', audioBlob.size, 'type:', audioBlob.type);
        await processAudio(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.onerror = (event) => {
        console.error('[App] MediaRecorder error:', event.error);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      console.log('[App] Recording started');
      setStatus(STATUS.RECORDING);
      setErrorMessage('');
    } catch (error) {
      console.error('[App] Failed to start recording:', error);
      setStatus(STATUS.ERROR);
      setErrorMessage('No se pudo acceder al micrófono: ' + error.message);
    }
  }, [settings, cleanupAudioResources]);

  const stopRecording = useCallback(() => {
    console.log('[App] Stopping recording...');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Request any remaining data before stopping
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData();
      }
      mediaRecorderRef.current.stop();
      console.log('[App] MediaRecorder.stop() called');
      setStatus(STATUS.PROCESSING);
    } else {
      console.log('[App] MediaRecorder not active, state:', mediaRecorderRef.current?.state);
    }
  }, []);

  const processAudio = async (audioBlob) => {
    console.log('[App] Processing audio, blob size:', audioBlob.size);
    try {
      if (audioBlob.size === 0) {
        throw new Error('No se grabó audio. Por favor intenta de nuevo.');
      }

      // Convert blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      console.log('[App] ArrayBuffer size:', arrayBuffer.byteLength);

      // Get current API keys from localStorage (in case they were updated)
      const currentOpenAIKey = localStorage.getItem('openaiKey') || '';
      const currentAnthropicKey = localStorage.getItem('anthropicKey') || '';

      console.log('[App] Calling transcribeAudio with API key:', currentOpenAIKey ? 'SET' : 'NOT SET');

      // Transcribe
      const transcriptionResult = await window.electronAPI.transcribeAudio(
        Array.from(new Uint8Array(arrayBuffer)),
        {
          language: settings.language,
          apiKey: currentOpenAIKey
        }
      );

      console.log('[App] Transcription result:', transcriptionResult);

      if (!transcriptionResult.success) {
        throw new Error(transcriptionResult.error || 'Transcription failed');
      }

      let finalText = transcriptionResult.text;
      console.log('[App] Transcribed text:', finalText);

      // Process with AI if smart mode
      if (settings.processingMode === 'smart' && finalText) {
        console.log('[App] Processing with AI, provider:', settings.reasoningProvider);
        const processResult = await window.electronAPI.processText(
          finalText,
          {
            provider: settings.reasoningProvider,
            apiKey: currentOpenAIKey,
            anthropicKey: currentAnthropicKey
          }
        );

        console.log('[App] AI processing result:', processResult);

        if (processResult.success) {
          finalText = processResult.text;
        } else {
          console.warn('[App] AI processing failed, using original text');
        }
      }

      // Paste text
      console.log('[App] Pasting text...');
      await window.electronAPI.pasteText(finalText);

      // Save to history
      console.log('[App] Saving to history...');
      await window.electronAPI.saveTranscription({
        original_text: transcriptionResult.text,
        processed_text: finalText,
        is_processed: settings.processingMode === 'smart',
        processing_method: settings.processingMode === 'smart' ? settings.reasoningProvider : 'none'
      });

      setLastText(finalText);
      setStatus(STATUS.SUCCESS);
      console.log('[App] Success!');

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setStatus(STATUS.IDLE);
      }, 2000);

    } catch (error) {
      console.error('[App] Processing error:', error);
      setStatus(STATUS.ERROR);
      setErrorMessage(error.message);

      // Reset to idle after 5 seconds on error (longer to read the message)
      setTimeout(() => {
        setStatus(STATUS.IDLE);
        setErrorMessage('');
      }, 5000);
    }
  };

  const handleClick = () => {
    if (status === STATUS.IDLE) {
      startRecording();
    } else if (status === STATUS.RECORDING) {
      stopRecording();
    }
  };

  const openSettings = () => {
    window.electronAPI?.showControlPanel();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-4">
      {/* Settings button */}
      <button
        onClick={openSettings}
        className="absolute top-3 right-3 p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"
        title="Configuración"
      >
        <Settings size={20} />
      </button>

      {/* Main status indicator */}
      <button
        onClick={handleClick}
        disabled={status === STATUS.PROCESSING}
        className={`
          w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300
          ${status === STATUS.IDLE ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : ''}
          ${status === STATUS.RECORDING ? 'bg-red-500 animate-pulse text-white' : ''}
          ${status === STATUS.PROCESSING ? 'bg-blue-500 text-white' : ''}
          ${status === STATUS.SUCCESS ? 'bg-green-500 text-white' : ''}
          ${status === STATUS.ERROR ? 'bg-red-600 text-white' : ''}
        `}
      >
        {status === STATUS.IDLE && <Mic size={40} />}
        {status === STATUS.RECORDING && <MicOff size={40} />}
        {status === STATUS.PROCESSING && <Loader2 size={40} className="animate-spin" />}
        {status === STATUS.SUCCESS && <Check size={40} />}
        {status === STATUS.ERROR && <AlertCircle size={40} />}
      </button>

      {/* Status text */}
      <div className="mt-4 text-center px-4">
        <p className="text-slate-300 text-sm">
          {status === STATUS.IDLE && 'Presiona Ctrl+Shift+Space o haz clic'}
          {status === STATUS.RECORDING && 'Grabando... (presiona de nuevo para detener)'}
          {status === STATUS.PROCESSING && 'Procesando...'}
          {status === STATUS.SUCCESS && 'Texto copiado'}
          {status === STATUS.ERROR && errorMessage}
        </p>
      </div>

      {/* Last transcription preview */}
      {lastText && status === STATUS.SUCCESS && (
        <div className="mt-4 p-3 bg-slate-700/50 rounded-lg max-w-full">
          <p className="text-slate-300 text-xs truncate max-w-[280px]">{lastText}</p>
        </div>
      )}

      {/* Mode indicator */}
      <div className="absolute bottom-3 left-3 text-xs text-slate-500">
        Modo: {settings.processingMode === 'smart' ? 'Inteligente' : 'Rápido'}
      </div>
    </div>
  );
}

export default App;

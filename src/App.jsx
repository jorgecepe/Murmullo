import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Check, AlertCircle, Loader2 } from 'lucide-react';

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
  const [processingStage, setProcessingStage] = useState(''); // Detailed progress indicator
  const [toast, setToast] = useState(null); // Toast for visible notifications
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
  const toastTimeoutRef = useRef(null);

  // Play completion sound
  const playCompletionSound = useCallback(() => {
    try {
      // Use Web Audio API to generate a pleasant completion chime
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant two-tone chime (C5 then E5)
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5

      // Fade in and out
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.25);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.25);

      // Cleanup
      oscillator.onended = () => audioContext.close();
    } catch (e) {
      console.log('[App] Could not play completion sound:', e);
    }
  }, []);

  // Show toast notification
  const showToast = useCallback((type, message, duration = 5000) => {
    // Clear any existing toast timeout
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, duration);
  }, []);

  // Show error toast when status changes to ERROR
  useEffect(() => {
    if (status === STATUS.ERROR && errorMessage) {
      showToast('error', errorMessage);
    }
  }, [status, errorMessage, showToast]);

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

      // Create a unique session ID to prevent chunk contamination between recordings
      const sessionId = Date.now();
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('[App] Audio data available, size:', event.data.size, 'session:', sessionId);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[App] MediaRecorder stopped, chunks:', audioChunksRef.current.length, 'session:', sessionId);

        if (audioChunksRef.current.length === 0) {
          console.error('[App] No audio chunks collected!');
          setStatus(STATUS.ERROR);
          setErrorMessage('No se grabó audio. Intenta de nuevo.');
          return;
        }

        const actualMimeType = mediaRecorder.mimeType || 'audio/webm';
        console.log('[App] Using mimeType for blob:', actualMimeType);
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        console.log('[App] Audio blob created, size:', audioBlob.size, 'type:', audioBlob.type);

        // Clear chunks immediately after creating blob to prevent contamination
        audioChunksRef.current = [];

        await processAudio(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.onerror = (event) => {
        console.error('[App] MediaRecorder error:', event.error);
        audioChunksRef.current = []; // Clear on error too
      };

      mediaRecorderRef.current = mediaRecorder;
      // Don't use timeslice - record everything in one chunk to ensure valid EBML header
      mediaRecorder.start();
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Just stop - don't use requestData() as it can cause issues
      mediaRecorderRef.current.stop();
      console.log('[App] MediaRecorder.stop() called');
      setStatus(STATUS.PROCESSING);
    } else {
      console.log('[App] MediaRecorder not active, state:', mediaRecorderRef.current?.state);
    }
  }, []);

  // Convert audio blob to WAV format using Web Audio API
  // This avoids the Chromium bug where MediaRecorder produces corrupted WebM headers
  const convertToWav = async (audioBlob) => {
    console.log('[App] Converting audio to WAV format...');

    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log('[App] Decoded audio: duration=', audioBuffer.duration, 'sampleRate=', audioBuffer.sampleRate);

      // Convert to 16kHz mono WAV (optimal for Whisper)
      const targetSampleRate = 16000;
      const numChannels = 1;

      // Resample if needed
      let samples;
      if (audioBuffer.sampleRate !== targetSampleRate) {
        const offlineContext = new OfflineAudioContext(numChannels, audioBuffer.duration * targetSampleRate, targetSampleRate);
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start(0);
        const resampledBuffer = await offlineContext.startRendering();
        samples = resampledBuffer.getChannelData(0);
      } else {
        samples = audioBuffer.getChannelData(0);
      }

      // Convert float32 samples to int16
      const int16Samples = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Create WAV file
      const wavBuffer = new ArrayBuffer(44 + int16Samples.length * 2);
      const view = new DataView(wavBuffer);

      // WAV header
      const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + int16Samples.length * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true); // PCM chunk size
      view.setUint16(20, 1, true); // PCM format
      view.setUint16(22, numChannels, true);
      view.setUint32(24, targetSampleRate, true);
      view.setUint32(28, targetSampleRate * numChannels * 2, true); // byte rate
      view.setUint16(32, numChannels * 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample
      writeString(36, 'data');
      view.setUint32(40, int16Samples.length * 2, true);

      // Write samples
      const dataView = new Int16Array(wavBuffer, 44);
      dataView.set(int16Samples);

      console.log('[App] WAV conversion complete, size:', wavBuffer.byteLength);
      return wavBuffer;
    } finally {
      await audioContext.close();
    }
  };

  const processAudio = async (audioBlob) => {
    console.log('[App] Processing audio, blob size:', audioBlob.size);
    try {
      if (audioBlob.size === 0) {
        throw new Error('No se grabó audio. Por favor intenta de nuevo.');
      }

      // Stage 1: Converting audio
      setProcessingStage('Preparando audio...');

      // Convert to WAV to avoid Chromium's corrupted WebM header bug
      let arrayBuffer;
      try {
        arrayBuffer = await convertToWav(audioBlob);
        console.log('[App] Using WAV format, size:', arrayBuffer.byteLength);
      } catch (conversionError) {
        console.warn('[App] WAV conversion failed, falling back to original format:', conversionError);
        arrayBuffer = await audioBlob.arrayBuffer();
      }

      console.log('[App] ArrayBuffer size:', arrayBuffer.byteLength);

      // Get current API keys from localStorage (in case they were updated)
      const currentOpenAIKey = localStorage.getItem('openaiKey') || '';
      const currentAnthropicKey = localStorage.getItem('anthropicKey') || '';

      console.log('[App] Calling transcribeAudio with API key:', currentOpenAIKey ? 'SET' : 'NOT SET');

      // Stage 2: Transcribing
      setProcessingStage('Transcribiendo...');

      // Transcribe
      const transcriptionResult = await window.electronAPI.transcribeAudio(
        Array.from(new Uint8Array(arrayBuffer)),
        {
          language: settings.language,
          apiKey: currentOpenAIKey,
          processingMode: settings.processingMode // verbatim, fast, or smart
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
        // Stage 3: AI Processing
        setProcessingStage('Procesando con IA...');

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

      // Stage 4: Pasting
      setProcessingStage('Pegando texto...');

      // Paste text
      console.log('[App] Pasting text...');
      await window.electronAPI.pasteText(finalText);

      // Stage 5: Saving
      setProcessingStage('Guardando...');

      // Save to history
      console.log('[App] Saving to history...');
      await window.electronAPI.saveTranscription({
        original_text: transcriptionResult.text,
        processed_text: finalText,
        is_processed: settings.processingMode === 'smart',
        processing_method: settings.processingMode === 'smart' ? settings.reasoningProvider : 'none'
      });

      setLastText(finalText);
      setProcessingStage('');
      setStatus(STATUS.SUCCESS);

      // Play completion sound if enabled
      const soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
      if (soundEnabled) {
        playCompletionSound();
      }
      console.log('[App] Success!');

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setStatus(STATUS.IDLE);
      }, 2000);

    } catch (error) {
      console.error('[App] Processing error:', error);
      setProcessingStage('');
      setStatus(STATUS.ERROR);
      setErrorMessage(error.message);

      // Reset to idle after 5 seconds on error (longer to read the message)
      setTimeout(() => {
        setStatus(STATUS.IDLE);
        setErrorMessage('');
      }, 5000);
    }
  };

  // Minimal floating indicator - just a small circle that shows status
  // No click needed - only responds to hotkey (Ctrl+Shift+Space)
  return (
    <div className="w-[60px] h-[60px] flex flex-col items-center justify-center bg-transparent relative">

      {/* Minimal status indicator */}
      <div
        className={`
          w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg
          ${status === STATUS.IDLE ? 'bg-slate-700/90 text-slate-400' : ''}
          ${status === STATUS.RECORDING ? 'bg-red-500 animate-pulse text-white shadow-red-500/50' : ''}
          ${status === STATUS.PROCESSING ? 'bg-blue-500 text-white shadow-blue-500/50' : ''}
          ${status === STATUS.SUCCESS ? 'bg-green-500 text-white shadow-green-500/50' : ''}
          ${status === STATUS.ERROR ? 'bg-red-600 text-white shadow-red-600/50' : ''}
        `}
        title={
          status === STATUS.IDLE ? 'Murmullo - Ctrl+Shift+Space para grabar' :
          status === STATUS.RECORDING ? 'Grabando... (Ctrl+Shift+Space para detener)' :
          status === STATUS.PROCESSING ? processingStage || 'Procesando...' :
          status === STATUS.SUCCESS ? 'Listo' :
          errorMessage || 'Error'
        }
      >
        {status === STATUS.IDLE && <Mic size={20} />}
        {status === STATUS.RECORDING && <MicOff size={20} />}
        {status === STATUS.PROCESSING && <Loader2 size={20} className="animate-spin" />}
        {status === STATUS.SUCCESS && <Check size={20} />}
        {status === STATUS.ERROR && <AlertCircle size={20} />}
      </div>
    </div>
  );
}

export default App;

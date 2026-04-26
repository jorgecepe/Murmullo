import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Check, AlertCircle, Loader2, X, HelpCircle } from 'lucide-react';
import { playCompletionChime } from './lib/sounds';

// Hard cap: any single recording longer than this is automatically stopped.
// Protects against forgotten hotkeys, crashes, and runaway memory growth.
const MAX_RECORDING_MS = 5 * 60 * 1000; // 5 minutes

// Status states
const STATUS = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error',
  SILENCE_DETECTED: 'silence_detected'
};

function App() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastText, setLastText] = useState('');
  const [processingStage, setProcessingStage] = useState(''); // Detailed progress indicator
  const [toast, setToast] = useState(null); // Toast for visible notifications
  const [usageGate, setUsageGate] = useState(null); // { allowed, percent, secondsRemaining, ... }
  const [settings, setSettings] = useState({
    processingMode: 'smart',
    language: 'es',
    reasoningProvider: 'anthropic',
    transcriptionProvider: 'openai', // 'openai' | 'groq'
    instantPaste: false, // paste raw Whisper text immediately, refine with Claude in background
    fastUpload: true, // skip WAV conversion, send WebM/Opus directly (~10x smaller upload)
    silenceDetection: true, // skip transcription if recording has no detectable voice
    openaiKey: '',
    anthropicKey: ''
  });

  const [isHoveringIcon, setIsHoveringIcon] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  // Tracks the user-initiated cancel request so that in-flight stages in
  // processAudio (WAV conversion, AI post-processing, paste) can bail out
  // even after the HTTP fetches are aborted by the main process.
  const cancelRequestedRef = useRef(false);
  // Pending "reset to IDLE" timeout after SUCCESS / ERROR states. Tracked so a
  // new recording started during the green-check window can cancel it, avoiding
  // the RECORDING state being overwritten back to IDLE a moment later.
  const resetStatusTimeoutRef = useRef(null);
  // Last raw Whisper output, captured before any AI / paste step. Used so that
  // if the user cancels mid-paste we can still persist the dictation.
  const lastWhisperTextRef = useRef(null);


  // Play completion sound. Implementation lives in src/lib/sounds.js so the
  // Settings preview button stays byte-identical to what users actually hear.
  const playCompletionSound = useCallback(() => {
    playCompletionChime();
  }, []);

  // Show toast notification. The floating mic window is locked at 60x60 with
  // transparent background, which makes inline toasts impractical: instead
  // we route warning/error toasts through the OS notification center via
  // electronAPI.showNotification, while still keeping the in-state copy for
  // future inline UIs and tests.
  const showToast = useCallback((type, message, duration = 5000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, duration);

    // OS notification for warning/error so the user actually sees it.
    if (type === 'warning' || type === 'error') {
      try {
        window.electronAPI?.showNotification?.({
          title: type === 'error' ? 'Murmullo - Error' : 'Murmullo',
          body: message,
          silent: true
        });
      } catch (_) {
        // Non-fatal: notifications might be disabled by the OS.
      }
    }
  }, []);

  // Show error toast when status changes to ERROR
  useEffect(() => {
    if (status === STATUS.ERROR && errorMessage) {
      showToast('error', errorMessage);
    }
  }, [status, errorMessage, showToast]);

  // Persist a transcription to history. Best-effort: failures here must not
  // affect the user-visible transcription flow, so we only log on error.
  // Called from both the synchronous and the instantPaste fire-and-forget
  // branches, and also when the user cancelled the paste but Whisper succeeded
  // (we still want the text in History so it isn't lost).
  const persistTranscription = useCallback(async ({
    originalText,
    processedText,
    processingMethod,
    agentName,
    error,
    transport
  }) => {
    if (!originalText) return null;
    try {
      const res = await window.electronAPI.saveTranscription({
        original_text: originalText,
        processed_text: processedText && processedText !== originalText ? processedText : null,
        is_processed: !!(processedText && processedText !== originalText),
        processing_method: processingMethod || 'none',
        agent_name: agentName || null,
        error: error || null,
        transport: transport || null
      });
      return res?.success ? (res.id ?? null) : null;
    } catch (e) {
      console.log('[App] saveTranscription failed:', e?.message);
      return null;
    }
  }, []);

  // Update an existing row in History. Used by the instant-paste flow when
  // the background AI refinement finishes, so we never end up with two rows
  // for a single dictation (cycle 2 H-202).
  const updateTranscription = useCallback(async ({
    id,
    processedText,
    processingMethod,
    agentName,
    transport
  }) => {
    if (!id) return;
    try {
      await window.electronAPI.updateTranscription({
        id,
        processed_text: processedText ?? undefined,
        processing_method: processingMethod ?? undefined,
        agent_name: agentName ?? undefined,
        transport: transport ?? undefined
      });
    } catch (e) {
      console.log('[App] updateTranscription failed:', e?.message);
    }
  }, []);

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
      transcriptionProvider: localStorage.getItem('transcriptionProvider') || 'openai',
      instantPaste: localStorage.getItem('instantPaste') === 'true',
      fastUpload: localStorage.getItem('fastUpload') !== 'false', // default true
      silenceDetection: localStorage.getItem('silenceDetection') !== 'false', // default true
      silenceThreshold: parseFloat(localStorage.getItem('silenceThreshold')) || 0.025,
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

  // Poll free-tier usage so the tooltip and status indicator can reflect the
  // remaining minutes. Only users without backend auth and without their own
  // API key are gated; for everyone else the response returns allowed=true
  // with secondsRemaining=Infinity and we skip the counter.
  useEffect(() => {
    if (!window.electronAPI?.getUsage) return;
    let cancelled = false;
    const fetchUsage = async () => {
      try {
        const res = await window.electronAPI.getUsage();
        if (cancelled || !res?.success) return;
        // Hide counter when unlimited (backend/BYOK); otherwise keep the gate.
        if (res.backendAuthenticated || res.summary?.hasOwnApiKey) {
          setUsageGate(null);
        } else {
          setUsageGate(res.gate);
        }
      } catch (e) {
        // Non-fatal; just skip the counter
      }
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [status]); // Re-fetch after status changes (especially post-transcription)

  // Handle hotkey toggle
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onToggleDictation(() => {
      console.log('[App] Hotkey triggered, current status:', status);
      if (status === STATUS.RECORDING) {
        stopRecording();
      } else if (status !== STATUS.PROCESSING) {
        // Allow starting a new recording from IDLE, SUCCESS, or ERROR without
        // waiting for the status badge to reset. The SUCCESS/ERROR states only
        // exist as a visual confirmation after a completed transcription.
        startRecording();
      }
    });

    return () => unsubscribe();
  }, [status]);

  const startRecording = useCallback(async () => {
    console.log('[App] Starting recording...');

    // If we were still in the SUCCESS/ERROR badge window from a previous
    // transcription, cancel that pending "reset to IDLE" so it doesn't fire a
    // second later and clobber the new RECORDING status.
    if (resetStatusTimeoutRef.current) {
      clearTimeout(resetStatusTimeoutRef.current);
      resetStatusTimeoutRef.current = null;
    }
    cancelRequestedRef.current = false;

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

      // Hard cap: stop recording after MAX_RECORDING_MS to prevent runaway memory
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.warn('[App] Max recording time reached, auto-stopping');
          showToast('warning', `Grabación detenida automáticamente tras ${MAX_RECORDING_MS / 60000} minutos.`, 6000);
          try { mediaRecorderRef.current.stop(); } catch (e) {}
          setStatus(STATUS.PROCESSING);
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      console.error('[App] Failed to start recording:', error);
      setStatus(STATUS.ERROR);
      setErrorMessage('No se pudo acceder al micrófono: ' + error.message);
    }
  }, [settings, cleanupAudioResources]);

  const stopRecording = useCallback(() => {
    console.log('[App] Stopping recording...');
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
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

      // Silence gate: decode the captured audio and check peak RMS over
      // 100ms windows. If the loudest window is still below the speech
      // threshold, skip the API call. This is deterministic (no dependency
      // on AudioContext state during recording) and catches the typical
      // hallucinations like "Subtítulos de Amara.org" on silent audio.
      // Cost: ~30-80ms to decode a few-second clip.
      if (settings.silenceDetection) {
        try {
          const silenceStart = performance.now();
          const ab = await audioBlob.arrayBuffer();
          // Clone the buffer because decodeAudioData detaches it and we still
          // need the original bytes for the upload step below.
          const abForDecode = ab.slice(0);
          const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
          let audioBuf;
          try {
            audioBuf = await decodeCtx.decodeAudioData(abForDecode);
          } finally {
            try { await decodeCtx.close(); } catch (e) {}
          }
          const samples = audioBuf.getChannelData(0);
          const sr = audioBuf.sampleRate;
          const windowSize = Math.max(1, Math.floor(sr * 0.1)); // 100ms
          let peakWindowRms = 0;
          let meanSq = 0;
          for (let start = 0; start < samples.length; start += windowSize) {
            const end = Math.min(start + windowSize, samples.length);
            let sumSq = 0;
            for (let i = start; i < end; i++) sumSq += samples[i] * samples[i];
            const rms = Math.sqrt(sumSq / (end - start));
            if (rms > peakWindowRms) peakWindowRms = rms;
            meanSq += sumSq;
          }
          const overallRms = Math.sqrt(meanSq / samples.length);
          const threshold = settings.silenceThreshold || 0.025;
          const elapsed = Math.round(performance.now() - silenceStart);
          const diagnostic = {
            peakWindowRms: +peakWindowRms.toFixed(5),
            overallRms: +overallRms.toFixed(5),
            threshold,
            durationSec: +audioBuf.duration.toFixed(2),
            sampleRate: sr,
            decodeMs: elapsed,
            willSkip: peakWindowRms < threshold
          };
          console.log('[App] Silence gate:', diagnostic);
          // Also ship to the file logs so users can tune the threshold from
          // Configuración → Logs without opening DevTools.
          window.electronAPI?.logFromRenderer?.({
            level: 'INFO',
            tag: 'silence-gate',
            data: diagnostic
          });
          if (peakWindowRms < threshold) {
            console.log('[App] Silence gate triggered, skipping transcription');
            setStatus(STATUS.SILENCE_DETECTED);
            setProcessingStage('');
            setTimeout(() => setStatus(STATUS.IDLE), 2000);
            return;
          }
        } catch (err) {
          console.warn('[App] Silence gate decode failed, proceeding with transcription:', err?.message);
          window.electronAPI?.logFromRenderer?.({
            level: 'ERROR',
            tag: 'silence-gate',
            data: `decode failed: ${err?.message || err}`
          });
        }
      }

      // Stage 1: Preparing audio
      setProcessingStage('Preparando audio...');

      // Fast path (default): send WebM/Opus straight to the API. Saves the
      // ~200-500ms AudioContext decode+resample+WAV encode AND sends ~10×
      // fewer bytes over the wire. If Chromium produced a corrupted WebM
      // header, main.js repairs it via ffmpeg before uploading.
      //
      // Safe path (fastUpload off): convert to WAV in the renderer first.
      // Kept as a toggle in case a user hits a rare encoding issue.
      let arrayBuffer;
      if (settings.fastUpload) {
        try {
          arrayBuffer = await audioBlob.arrayBuffer();
          console.log('[App] Fast upload: sending WebM/Opus directly, size:', arrayBuffer.byteLength, 'type:', audioBlob.type);
        } catch (err) {
          console.warn('[App] Fast upload failed, falling back to WAV conversion:', err);
          arrayBuffer = await convertToWav(audioBlob);
        }
      } else {
        try {
          arrayBuffer = await convertToWav(audioBlob);
          console.log('[App] Using WAV format, size:', arrayBuffer.byteLength);
        } catch (conversionError) {
          console.warn('[App] WAV conversion failed, falling back to original format:', conversionError);
          arrayBuffer = await audioBlob.arrayBuffer();
        }
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
          processingMode: settings.processingMode, // verbatim, fast, or smart
          transcriptionProvider: settings.transcriptionProvider // 'openai' | 'groq'
        }
      );

      console.log('[App] Transcription result:', transcriptionResult);

      if (!transcriptionResult.success) {
        // Surface friendly, actionable errors. The main process returns
        // structured error codes; translate them into user-facing messages.
        const code = transcriptionResult.code || transcriptionResult.error;
        if (code === 'CANCELLED' || transcriptionResult.error === 'cancelled') {
          throw new Error('cancelled');
        }
        if (code === 'FREE_TIER_EXHAUSTED' || transcriptionResult.error === 'free_tier_exhausted') {
          throw new Error('Agotaste los 30 minutos gratuitos. Agrega tu API key en Configuración o suscríbete a un plan.');
        }
        if (transcriptionResult.error === 'rate_limit_exceeded') {
          throw new Error(transcriptionResult.message || 'Demasiadas solicitudes seguidas. Espera unos segundos.');
        }
        const raw = transcriptionResult.error || 'Transcription failed';
        if (/api key|unauthorized|401/i.test(raw)) {
          throw new Error('API key inválida o faltante. Configúrala en el Panel de control → API Keys.');
        }
        if (/network|fetch|ENOTFOUND|timeout|abort/i.test(raw)) {
          throw new Error('Sin conexión o el servidor tardó demasiado. Revisa tu internet e intenta de nuevo.');
        }
        throw new Error(raw);
      }

      let finalText = transcriptionResult.text;
      const originalWhisperText = transcriptionResult.text;
      lastWhisperTextRef.current = originalWhisperText;
      console.log('[App] Transcribed text:', finalText);

      // Surface backend->local fallback to the user. Cycle 1 plumbed the flag
      // through main.js but the renderer never read it, so the user silently
      // burned local quota when the backend was down. (cycle 2 H-206)
      if (transcriptionResult.viaBackendFallback) {
        const fallbackMsg = transcriptionResult.fallbackReason === 'auth_expired'
          ? 'Sesión expirada en el backend, transcribiendo localmente'
          : 'Backend no disponible, usando modo local';
        showToast('warning', fallbackMsg, 3000);
      }

      if (cancelRequestedRef.current) throw new Error('cancelled');

      // FIRE-AND-FORGET BRANCH: when instantPaste is on and Smart Mode is
      // active, we paste the raw Whisper text immediately and let Claude
      // refine in background. The refined version only updates `lastText`
      // (and history, when we wire that). The user gets perceived latency
      // of just (network + compute) instead of (network + Whisper + Claude).
      const shouldFireAndForget =
        settings.instantPaste &&
        settings.processingMode === 'smart' &&
        !!finalText;

      if (shouldFireAndForget) {
        setProcessingStage('Pegando texto...');
        console.log('[App] Instant paste: pasting raw Whisper text...');
        await window.electronAPI.pasteText(finalText);
        setLastText(finalText);
        setProcessingStage('');
        setStatus(STATUS.SUCCESS);

        const soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
        if (soundEnabled) playCompletionSound();

        if (resetStatusTimeoutRef.current) clearTimeout(resetStatusTimeoutRef.current);
        resetStatusTimeoutRef.current = setTimeout(() => {
          setStatus(STATUS.IDLE);
          resetStatusTimeoutRef.current = null;
        }, 2000);

        // Persist with the raw text first so History captures the dictation
        // even if the background refinement never finishes (network drop,
        // app close). We capture the inserted row id and, when the refinement
        // succeeds, UPDATE that same row instead of inserting a second copy
        // (cycle 2 H-202 fix; previously History double-counted).
        const transcriptionTransport =
          transcriptionResult.transport ||
          (transcriptionResult.viaBackendFallback
            ? 'local-fallback'
            : (transcriptionResult.viaBackend ? 'backend' : 'local'));
        const insertedId = await persistTranscription({
          originalText: originalWhisperText,
          processedText: null,
          processingMethod: 'fast',
          agentName: null,
          error: null,
          transport: transcriptionTransport
        });
        lastWhisperTextRef.current = null;

        // Background refinement (best-effort, errors are silent to the user).
        // Intentionally no await — this is fire-and-forget. On success we
        // promote the same row from 'fast' to 'smart' via UPDATE; on failure
        // we leave the 'fast' row in place untouched.
        window.electronAPI.processText(finalText, {
          provider: settings.reasoningProvider,
          apiKey: currentOpenAIKey,
          anthropicKey: currentAnthropicKey
        })
          .then((res) => {
            // Defensive: backend may return success:true with metadata.processed=false
            // when the upstream AI provider failed (e.g. invalid Anthropic key).
            // Treat that case as a refinement failure so we don't pretend smart
            // mode succeeded with raw text. (cycle 2 H-204)
            const aiActuallyProcessed =
              res?.success === true &&
              !!res.text &&
              res.metadata?.processed !== false &&
              !res.error;

            if (aiActuallyProcessed) {
              console.log('[App] Background AI refinement complete');
              setLastText(res.text);
              if (insertedId) {
                updateTranscription({
                  id: insertedId,
                  processedText: res.text,
                  processingMethod: 'smart',
                  agentName: settings.reasoningProvider
                });
              }
            } else {
              console.log('[App] Background AI refinement skipped or failed:', res?.error || 'no AI processing');
              if (res?.metadata?.processed === false) {
                showToast('warning', 'Smart Mode no disponible, texto sin procesar', 4000);
                try { window.electronAPI.logFromRenderer?.({
                  level: 'warn',
                  source: 'App',
                  message: 'AI_PROCESSING_FAILED_BACKEND',
                  data: { error: res?.error || 'metadata.processed=false' }
                }); } catch (_) {}
              }
            }
          })
          .catch((err) => console.log('[App] Background AI refinement error:', err?.message));

        return;
      }

      // Process with AI if smart mode (synchronous path)
      let aiAttempted = false;
      let aiError = null;
      if (settings.processingMode === 'smart' && finalText) {
        // Stage 3: AI Processing
        setProcessingStage('Procesando con IA...');

        console.log('[App] Processing with AI, provider:', settings.reasoningProvider);
        aiAttempted = true;
        const processResult = await window.electronAPI.processText(
          finalText,
          {
            provider: settings.reasoningProvider,
            apiKey: currentOpenAIKey,
            anthropicKey: currentAnthropicKey
          }
        );

        console.log('[App] AI processing result:', processResult);

        // Backend may shape the response as success:true / metadata.processed=false
        // when the upstream provider failed (e.g. invalid Anthropic key on
        // server). We must NOT treat that as a smart-mode success or we'll
        // silently paste raw Whisper output while telling the user it was
        // refined. (cycle 2 H-204)
        const aiActuallyProcessed =
          processResult.success === true &&
          !!processResult.text &&
          processResult.metadata?.processed !== false &&
          !processResult.error;

        if (processResult.code === 'CANCELLED' || processResult.error === 'cancelled') {
          throw new Error('cancelled');
        } else if (aiActuallyProcessed) {
          finalText = processResult.text;
        } else {
          aiError = processResult.error || 'AI processing failed';
          if (processResult.metadata?.processed === false) {
            showToast('warning', 'Smart Mode no disponible, texto sin procesar', 4000);
            try { window.electronAPI.logFromRenderer?.({
              level: 'warn',
              source: 'App',
              message: 'AI_PROCESSING_FAILED_BACKEND',
              data: { error: processResult.error || 'metadata.processed=false' }
            }); } catch (_) {}
          }
          console.warn('[App] AI processing failed, using original text');
        }
      }

      if (cancelRequestedRef.current) throw new Error('cancelled');

      // Stage 4: Pasting
      setProcessingStage('Pegando texto...');

      // Paste text
      console.log('[App] Pasting text...');
      await window.electronAPI.pasteText(finalText);

      setLastText(finalText);
      setProcessingStage('');
      setStatus(STATUS.SUCCESS);

      // Play completion sound if enabled
      const soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
      if (soundEnabled) {
        playCompletionSound();
      }
      console.log('[App] Success!');

      // Save to history. processing_method reflects what we actually applied,
      // not what was selected: if smart was selected but AI failed, we still
      // persist with method='fast' (Whisper output passed through formatter)
      // and stash the AI error in `error` for diagnostics.
      const appliedMethod =
        settings.processingMode === 'smart' && aiAttempted && !aiError ? 'smart' :
        settings.processingMode === 'verbatim' ? 'verbatim' : 'fast';
      const syncTransport =
        transcriptionResult.transport ||
        (transcriptionResult.viaBackendFallback
          ? 'local-fallback'
          : (transcriptionResult.viaBackend ? 'backend' : 'local'));
      persistTranscription({
        originalText: originalWhisperText,
        processedText: finalText,
        processingMethod: appliedMethod,
        agentName: appliedMethod === 'smart' ? settings.reasoningProvider : null,
        error: aiError,
        transport: syncTransport
      });
      lastWhisperTextRef.current = null;

      // Reset to idle after 2 seconds. Tracked so a new recording started
      // during this window can cancel it (see startRecording).
      if (resetStatusTimeoutRef.current) clearTimeout(resetStatusTimeoutRef.current);
      resetStatusTimeoutRef.current = setTimeout(() => {
        setStatus(STATUS.IDLE);
        resetStatusTimeoutRef.current = null;
      }, 2000);

    } catch (error) {
      console.error('[App] Processing error:', error);
      setProcessingStage('');

      // If the user pressed the Cancel (X) button, don't show an error badge.
      if (cancelRequestedRef.current || error?.message === 'cancelled') {
        cancelRequestedRef.current = false;
        // Even on cancel, if Whisper produced text we save it so the user
        // doesn't lose work they already paid time and quota for.
        if (lastWhisperTextRef.current) {
          persistTranscription({
            originalText: lastWhisperTextRef.current,
            processedText: null,
            processingMethod: 'none',
            agentName: null,
            error: 'cancelled_by_user'
          });
          lastWhisperTextRef.current = null;
        }
        setStatus(STATUS.IDLE);
        setErrorMessage('');
        return;
      }

      setStatus(STATUS.ERROR);
      setErrorMessage(error.message);

      // If Whisper had succeeded but a downstream step failed (paste, AI on
      // smart mode), keep the dictation in History.
      if (lastWhisperTextRef.current) {
        persistTranscription({
          originalText: lastWhisperTextRef.current,
          processedText: null,
          processingMethod: 'none',
          agentName: null,
          error: error?.message || 'unknown_error'
        });
        lastWhisperTextRef.current = null;
      }

      // Reset to idle after 5 seconds on error (longer to read the message)
      if (resetStatusTimeoutRef.current) clearTimeout(resetStatusTimeoutRef.current);
      resetStatusTimeoutRef.current = setTimeout(() => {
        setStatus(STATUS.IDLE);
        setErrorMessage('');
        resetStatusTimeoutRef.current = null;
      }, 5000);
    }
  };

  // Minimal floating indicator - just a small circle that shows status
  // No click needed - only responds to hotkey (Ctrl+Shift+Space)
  const handleMouseDown = useCallback((e) => {
    // Only the primary (left) button initiates window drag. Right-click opens
    // the context menu via onContextMenu; any secondary button should not drag.
    if (e.button !== 0) return;

    window.electronAPI.windowStartDrag();

    const handleMouseUp = () => {
      window.electronAPI.windowDragEnd();
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    window.electronAPI?.showFloatingMenu?.();
  }, []);

  const handleCancelClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[App] User cancelled in-flight transcription');
    cancelRequestedRef.current = true;
    try {
      await window.electronAPI?.cancelTranscription?.();
    } catch (err) {
      console.warn('[App] cancelTranscription call failed:', err);
    }
    setProcessingStage('');
    setStatus(STATUS.IDLE);
    setIsHoveringIcon(false);
  }, []);

  const showCancelOverlay = status === STATUS.PROCESSING && isHoveringIcon;

  return (
    <div className="w-[60px] h-[60px] flex flex-col items-center justify-center bg-transparent relative">

      {/* Minimal status indicator - draggable */}
      <div
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHoveringIcon(true)}
        onMouseLeave={() => setIsHoveringIcon(false)}
        className={`
          relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg cursor-grab active:cursor-grabbing
          ${status === STATUS.IDLE ? 'bg-slate-700/90 text-slate-400' : ''}
          ${status === STATUS.RECORDING ? 'bg-red-500 animate-pulse text-white shadow-red-500/50' : ''}
          ${status === STATUS.PROCESSING ? 'bg-blue-500 text-white shadow-blue-500/50' : ''}
          ${status === STATUS.SUCCESS ? 'bg-green-500 text-white shadow-green-500/50' : ''}
          ${status === STATUS.ERROR ? 'bg-red-600 text-white shadow-red-600/50' : ''}
          ${status === STATUS.SILENCE_DETECTED ? 'bg-amber-500/90 text-white shadow-amber-500/50' : ''}
        `}
        title={
          status === STATUS.IDLE ? `Murmullo - Ctrl+Shift+Space para grabar (clic derecho para menú)${usageGate ? ` | ${(usageGate.secondsRemaining / 60).toFixed(1)} min restantes de prueba gratuita` : ''}` :
          status === STATUS.RECORDING ? 'Grabando... (Ctrl+Shift+Space para detener)' :
          status === STATUS.PROCESSING ? `${processingStage || 'Procesando...'} - Haz clic en la X para cancelar` :
          status === STATUS.SUCCESS ? 'Listo' :
          status === STATUS.SILENCE_DETECTED ? 'No se detectó audio. Verifica que tu micrófono esté activo y hables más alto.' :
          errorMessage || 'Error'
        }
      >
        {/* Base status icon - hidden while the cancel overlay is shown so the
            X replaces the spinner cleanly on hover during PROCESSING. */}
        {!showCancelOverlay && status === STATUS.IDLE && <Mic size={20} />}
        {!showCancelOverlay && status === STATUS.RECORDING && <MicOff size={20} />}
        {!showCancelOverlay && status === STATUS.PROCESSING && <Loader2 size={20} className="animate-spin" />}
        {!showCancelOverlay && status === STATUS.SUCCESS && <Check size={20} />}
        {!showCancelOverlay && status === STATUS.ERROR && <AlertCircle size={20} />}
        {!showCancelOverlay && status === STATUS.SILENCE_DETECTED && <HelpCircle size={20} />}

        {/* Cancel overlay: only visible while hovering during PROCESSING. */}
        {showCancelOverlay && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleCancelClick}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-red-600 text-white cursor-pointer hover:bg-red-700 transition-colors"
            title="Cancelar envío"
            aria-label="Cancelar envío"
          >
            <X size={22} strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  );
}

export default App;

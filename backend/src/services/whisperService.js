import FormData from 'form-data';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Detect the actual audio container by inspecting the file header. The
// client sends WebM most of the time but the previous backend always
// labeled it audio/wav, which works on OpenAI but is non-deterministic and
// degrades reliability on Groq.
function detectAudioContainer(buffer) {
  if (!buffer || buffer.length < 12) {
    return { filename: 'audio.bin', contentType: 'application/octet-stream' };
  }
  const headerHex = buffer.slice(0, 4).toString('hex');
  const headerAscii = buffer.slice(0, 4).toString('ascii');

  if (headerAscii === 'RIFF') {
    return { filename: 'audio.wav', contentType: 'audio/wav' };
  }
  if (headerHex === '1a45dfa3') {
    return { filename: 'audio.webm', contentType: 'audio/webm' };
  }
  // ID3 (mp3) or 0xFF 0xFB (mp3 frame sync)
  if (headerAscii.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
    return { filename: 'audio.mp3', contentType: 'audio/mpeg' };
  }
  // OGG container
  if (headerAscii === 'OggS') {
    return { filename: 'audio.ogg', contentType: 'audio/ogg' };
  }
  // Fall back to WAV — same behavior as before, so we never regress for
  // unknown payloads. Whisper sniffs the body anyway.
  return { filename: 'audio.wav', contentType: 'audio/wav' };
}

/**
 * Transcribe audio using OpenAI Whisper API or Groq
 * @param {Buffer} audioBuffer - Audio data as buffer
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} - Transcription result
 */
// Provider → allowed model whitelist. The route layer also validates the
// model string, but we re-check here so any direct caller (tests, internal
// jobs) can't smuggle in an unsupported model.
const ALLOWED_MODELS = {
  groq: new Set(['whisper-large-v3-turbo', 'whisper-large-v3']),
  openai: new Set(['whisper-1'])
};

const DEFAULT_MODELS = {
  groq: 'whisper-large-v3-turbo',
  openai: 'whisper-1'
};

// Build the Whisper "initial prompt" (max 224 tokens, ~600 chars). Mirrors
// the local-mode prompt in main.js so backend transcriptions get the same
// anchoring as local mode. If a dictionaryHint comes from the client, it
// gets injected as "Términos especiales" so Whisper recognizes the user's
// custom vocabulary (proper nouns, brands, domain jargon).
function buildWhisperPrompt(dictionaryHint) {
  const trimmed = (dictionaryHint || '').trim();
  if (trimmed) {
    return `Transcripción literal de dictado de voz en español. Términos especiales: ${trimmed}. Transcribir exactamente lo que se dice, palabra por palabra, sin interpretar ni resumir.`;
  }
  return 'Transcripción literal de dictado de voz en español. Transcribir exactamente lo que se dice, palabra por palabra, sin interpretar ni resumir.';
}

export async function transcribeAudio(audioBuffer, options = {}) {
  const {
    language = 'es',
    provider = process.env.TRANSCRIPTION_PROVIDER || 'openai',
    responseFormat = 'json',
    dictionaryHint = '',
    model: requestedModel
  } = options;

  // Select provider, API key, and model
  let apiUrl, apiKey, model;

  if (provider === 'groq') {
    apiUrl = GROQ_API_URL;
    apiKey = process.env.GROQ_API_KEY;
    model = (requestedModel && ALLOWED_MODELS.groq.has(requestedModel))
      ? requestedModel
      : DEFAULT_MODELS.groq;

    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
  } else {
    // Default to OpenAI
    apiUrl = OPENAI_API_URL;
    apiKey = process.env.OPENAI_API_KEY;
    model = (requestedModel && ALLOWED_MODELS.openai.has(requestedModel))
      ? requestedModel
      : DEFAULT_MODELS.openai;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
  }

  const prompt = buildWhisperPrompt(dictionaryHint);

  const startTime = Date.now();

  try {
    // Detect the actual audio container from the buffer header. The local
    // client sends WebM raw (no re-encoding) most of the time; mislabeling
    // it as audio/wav was harmless on OpenAI but inconsistent and hurts
    // determinism. WAV files start with 'RIFF', WebM/Matroska with the
    // EBML signature 1A 45 DF A3.
    const { filename, contentType } = detectAudioContainer(audioBuffer);

    // Create form data
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename,
      contentType
    });
    formData.append('model', model);

    // Groq doesn't support language: 'auto', so map it to 'es'
    let finalLanguage = language;
    if (provider === 'groq' && language === 'auto') {
      logger.info('Groq does not support auto language detection, using es');
      finalLanguage = 'es';
    }

    if (finalLanguage && finalLanguage !== 'auto') {
      formData.append('language', finalLanguage);
    }
    formData.append('response_format', responseFormat);
    // Prompt helps anchor Whisper and reduce hallucinations
    if (prompt) {
      formData.append('prompt', prompt);
    }
    // Temperature 0 = most deterministic/literal transcription
    formData.append('temperature', '0');

    // Make API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Whisper API error', {
        provider,
        status: response.status,
        error: errorData.error?.message || 'Unknown error',
        latency
      });
      throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
    }

    const result = await response.json();

    logger.info('Whisper transcription complete', {
      provider,
      model,
      latency,
      textLength: result.text?.length || 0,
      language: finalLanguage,
      audioContentType: contentType,
      hasDictionaryHint: !!dictionaryHint && dictionaryHint.trim().length > 0
    });

    return {
      success: true,
      text: result.text,
      language: finalLanguage,
      latency,
      model,
      provider
    };

  } catch (error) {
    logger.error('Whisper service error', { error: error.message, provider });
    throw error;
  }
}

/**
 * Estimate audio duration from buffer size
 * Assumes 16kHz, 16-bit, mono WAV
 */
export function estimateAudioDuration(bufferSize) {
  const headerSize = 44; // WAV header
  const dataSize = bufferSize - headerSize;
  const bytesPerSecond = 16000 * 2; // 16kHz * 2 bytes per sample
  return dataSize / bytesPerSecond;
}

export default { transcribeAudio, estimateAudioDuration };

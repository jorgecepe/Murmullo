import FormData from 'form-data';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * Transcribe audio using OpenAI Whisper API or Groq
 * @param {Buffer} audioBuffer - Audio data as buffer
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} - Transcription result
 */
export async function transcribeAudio(audioBuffer, options = {}) {
  const {
    language = 'es',
    provider = process.env.TRANSCRIPTION_PROVIDER || 'openai',
    responseFormat = 'json',
    // Prompt helps reduce hallucinations by anchoring Whisper to expected content
    prompt = 'Transcripción literal de dictado de voz en español. Transcribir exactamente lo que se dice, palabra por palabra, sin interpretar ni resumir.'
  } = options;

  // Select provider and API key
  let apiUrl, apiKey, model;

  if (provider === 'groq') {
    apiUrl = GROQ_API_URL;
    apiKey = process.env.GROQ_API_KEY;
    model = 'whisper-large-v3-turbo';

    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
  } else {
    // Default to OpenAI
    apiUrl = OPENAI_API_URL;
    apiKey = process.env.OPENAI_API_KEY;
    model = 'whisper-1';

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
  }

  const startTime = Date.now();

  try {
    // Create form data
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
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
      latency,
      textLength: result.text?.length || 0,
      language: finalLanguage
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

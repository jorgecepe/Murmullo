import FormData from 'form-data';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Transcribe audio using OpenAI Whisper API
 * @param {Buffer} audioBuffer - Audio data as buffer
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} - Transcription result
 */
export async function transcribeAudio(audioBuffer, options = {}) {
  const {
    language = 'es',
    model = 'whisper-1',
    responseFormat = 'json'
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
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
    formData.append('language', language);
    formData.append('response_format', responseFormat);

    // Make API request
    const response = await fetch(OPENAI_API_URL, {
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
        status: response.status,
        error: errorData.error?.message || 'Unknown error',
        latency
      });
      throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
    }

    const result = await response.json();

    logger.info('Whisper transcription complete', {
      latency,
      textLength: result.text?.length || 0,
      language
    });

    return {
      success: true,
      text: result.text,
      language,
      latency,
      model
    };

  } catch (error) {
    logger.error('Whisper service error', { error: error.message });
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

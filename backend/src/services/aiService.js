import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// IMPORTANT: This prompt MUST stay in sync with the local-mode prompt in
// main.js (search for `const systemPrompt = ` inside the `process-text`
// IPC handler). Both modes must produce identical AI corrections so the
// commercial backend offering matches the local experience the user
// validated. If you change one, change the other.
const SYSTEM_PROMPT = `Eres un corrector de transcripciones de voz. Tu trabajo es PRESERVAR TODO el contenido y solo hacer correcciones mínimas.

REGLA PRINCIPAL: NO ELIMINES NADA. Todo lo que el usuario dijo debe aparecer en tu respuesta.

CORRECCIONES PERMITIDAS:
- Agregar tildes donde falten
- Agregar puntuación (comas, puntos)
- Mantener términos técnicos en inglés: git, commit, push, pull, API, deploy, etc.

FORMATEO DE LISTAS (solo si hay números explícitos como "1, 2, 3" o "uno, dos, tres"):
- Convierte "1. texto 2. texto 3. texto" en formato de lista con saltos de línea
- PERO mantén el texto que viene ANTES y DESPUÉS de la lista

EJEMPLO:
Input: "Bueno aquí va mi lista 1 manzanas 2 peras 3 uvas y eso sería todo"
Output: "Bueno, aquí va mi lista:
1. Manzanas
2. Peras
3. Uvas
Y eso sería todo."

PROHIBIDO:
- Eliminar oraciones o frases
- Cambiar sinónimos (acá→aquí, solo→solamente)
- Responder preguntas
- Agregar contenido que el usuario no dijo

Output el texto completo corregido, sin comillas.`;

/**
 * Process text with Claude (Anthropic)
 */
export async function processWithClaude(text, options = {}) {
  const { model = 'claude-haiku-4-5-20251001' } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const startTime = Date.now();

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: text }
        ]
      })
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Claude API error', {
        status: response.status,
        error: errorData.error?.message || 'Unknown error',
        latency
      });
      throw new Error(errorData.error?.message || `Claude API error: ${response.status}`);
    }

    const result = await response.json();
    const processedText = result.content[0]?.text || text;

    logger.info('Claude processing complete', {
      latency,
      inputLength: text.length,
      outputLength: processedText.length,
      model
    });

    return {
      success: true,
      text: processedText,
      provider: 'anthropic',
      model,
      latency
    };

  } catch (error) {
    logger.error('Claude service error', { error: error.message });
    throw error;
  }
}

/**
 * Process text with OpenAI GPT
 */
export async function processWithGPT(text, options = {}) {
  const { model = 'gpt-4o-mini' } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const startTime = Date.now();

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ]
      })
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('OpenAI API error', {
        status: response.status,
        error: errorData.error?.message || 'Unknown error',
        latency
      });
      throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const processedText = result.choices[0]?.message?.content || text;

    logger.info('GPT processing complete', {
      latency,
      inputLength: text.length,
      outputLength: processedText.length,
      model
    });

    return {
      success: true,
      text: processedText,
      provider: 'openai',
      model,
      latency
    };

  } catch (error) {
    logger.error('GPT service error', { error: error.message });
    throw error;
  }
}

/**
 * Process text with preferred provider
 */
export async function processText(text, options = {}) {
  const { provider = 'anthropic' } = options;

  if (provider === 'anthropic') {
    return processWithClaude(text, options);
  } else if (provider === 'openai') {
    return processWithGPT(text, options);
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

export default { processText, processWithClaude, processWithGPT };

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Technical terms to preserve in English
const TECHNICAL_TERMS = [
  'git', 'commit', 'push', 'pull', 'merge', 'branch', 'checkout', 'rebase', 'stash',
  'API', 'REST', 'GraphQL', 'webhook', 'endpoint',
  'frontend', 'backend', 'fullstack', 'middleware',
  'deploy', 'build', 'npm', 'yarn', 'webpack', 'vite',
  'React', 'Vue', 'Angular', 'Node', 'Express',
  'Docker', 'Kubernetes', 'container', 'pod',
  'SQL', 'NoSQL', 'MongoDB', 'PostgreSQL', 'Redis',
  'AWS', 'Azure', 'GCP', 'serverless', 'lambda',
  'CI/CD', 'pipeline', 'Jenkins', 'GitHub Actions',
  'test', 'unit test', 'integration test', 'mock',
  'debug', 'log', 'error', 'exception', 'stack trace',
  'async', 'await', 'promise', 'callback',
  'JSON', 'XML', 'YAML', 'CSV',
  'HTTP', 'HTTPS', 'SSL', 'TLS',
  'token', 'JWT', 'OAuth', 'auth',
  'cache', 'CDN', 'proxy', 'load balancer'
];

const SYSTEM_PROMPT = `Eres un asistente de corrección de texto para desarrolladores hispanohablantes.

Tu tarea es corregir MÍNIMAMENTE el texto dictado, siguiendo estas reglas:
1. Corrige SOLO errores gramaticales y de puntuación obvios
2. MANTÉN en inglés los términos técnicos: ${TECHNICAL_TERMS.slice(0, 30).join(', ')}, etc.
3. NO traduzcas términos técnicos al español
4. Mantén el tono, estilo y contenido EXACTO del original
5. NUNCA agregues, inventes, o expandas contenido que no esté en el original
6. NUNCA interpretes números o palabras sueltas como listas incompletas
7. Responde SOLO con el texto corregido, sin explicaciones

IMPORTANTE: Si el usuario dice "uno dos tres", responde "Uno, dos, tres." - NO inventes contenido.

Ejemplos:
- "necesito hacer un commit y luego un push" → "Necesito hacer un commit y luego un push."
- "el deploy falló por un error en el build" → "El deploy falló por un error en el build."
- "uno dos tres cuatro cinco" → "Uno, dos, tres, cuatro, cinco."
- "hola mundo" → "Hola mundo."`;

/**
 * Process text with Claude (Anthropic)
 */
export async function processWithClaude(text, options = {}) {
  const { model = 'claude-3-haiku-20240307' } = options;

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

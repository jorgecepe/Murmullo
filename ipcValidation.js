/**
 * IPC Validation Module for Murmullo
 * Validates and sanitizes all IPC messages to prevent injection attacks
 */

/**
 * Validate that a value is a string
 */
function isString(value) {
  return typeof value === 'string';
}

/**
 * Validate that a value is a non-empty string
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate that a value is a number
 */
function isNumber(value) {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Validate that a value is a positive integer
 */
function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Validate that a value is a boolean
 */
function isBoolean(value) {
  return typeof value === 'boolean';
}

/**
 * Validate that a value is an array
 */
function isArray(value) {
  return Array.isArray(value);
}

/**
 * Validate that a value is an object (not null, not array)
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate audio data (should be an array of numbers 0-255)
 */
function isValidAudioData(value) {
  if (!isArray(value)) return false;
  if (value.length === 0) return false;
  if (value.length > 50 * 1024 * 1024) return false; // Max 50MB

  // Check a sample of values to ensure they're valid bytes
  const sampleSize = Math.min(100, value.length);
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor(i * value.length / sampleSize);
    const v = value[idx];
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      return false;
    }
  }
  return true;
}

/**
 * Validate API key format
 */
function isValidApiKey(value) {
  if (!isString(value)) return false;
  if (value === '') return true; // Empty is allowed (to clear key)

  // OpenAI keys start with sk-
  // Anthropic keys start with sk-ant-
  const validPrefixes = ['sk-', 'sk-ant-'];
  return validPrefixes.some(prefix => value.startsWith(prefix)) && value.length >= 20;
}

/**
 * Validate hotkey format
 */
function isValidHotkey(value) {
  if (!isString(value)) return false;

  // Must contain at least one modifier and one key
  const modifiers = ['CommandOrControl', 'Control', 'Ctrl', 'Command', 'Cmd', 'Alt', 'Shift', 'Super', 'Meta'];
  const hasModifier = modifiers.some(mod => value.includes(mod));

  // Basic format check: should have + separator
  const parts = value.split('+');
  if (parts.length < 2) return false;

  // Last part should be a single key (letter, number, or F-key)
  const key = parts[parts.length - 1].trim();
  const validKey = /^[A-Za-z0-9]$|^F[1-9]$|^F1[0-2]$|^Space$|^`$/.test(key);

  return hasModifier && validKey;
}

/**
 * Validate provider name
 */
function isValidProvider(value) {
  return ['openai', 'anthropic'].includes(value);
}

/**
 * Validate language code
 */
function isValidLanguage(value) {
  return ['es', 'en', 'auto'].includes(value);
}

/**
 * Validate transcription data for saving
 */
function isValidTranscriptionData(data) {
  if (!isObject(data)) return false;
  if (!isString(data.original_text)) return false;
  if (data.processed_text !== null && data.processed_text !== undefined && !isString(data.processed_text)) return false;
  return true;
}

/**
 * Validate filename (prevent path traversal)
 */
function isValidFilename(value) {
  if (!isString(value)) return false;
  // No path separators or special sequences
  if (value.includes('/') || value.includes('\\') || value.includes('..')) return false;
  // Must end with .log
  if (!value.endsWith('.log')) return false;
  // Basic filename pattern
  return /^[a-zA-Z0-9_\-\.]+$/.test(value);
}

/**
 * Sanitize string input (remove potentially dangerous characters)
 */
function sanitizeString(value, maxLength = 10000) {
  if (!isString(value)) return '';
  // Trim and limit length
  let sanitized = value.trim().substring(0, maxLength);
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  return sanitized;
}

/**
 * Create a validation result
 */
function validationResult(isValid, error = null) {
  return { isValid, error };
}

/**
 * Validate IPC message based on channel
 */
function validateIpcMessage(channel, ...args) {
  switch (channel) {
    case 'transcribe-audio': {
      const [audioData, options] = args;
      if (!isValidAudioData(audioData)) {
        return validationResult(false, 'Invalid audio data');
      }
      if (options && !isObject(options)) {
        return validationResult(false, 'Invalid options');
      }
      if (options?.language && !isValidLanguage(options.language)) {
        return validationResult(false, 'Invalid language');
      }
      return validationResult(true);
    }

    case 'process-text': {
      const [text, options] = args;
      if (!isString(text)) {
        return validationResult(false, 'Invalid text');
      }
      if (options && !isObject(options)) {
        return validationResult(false, 'Invalid options');
      }
      if (options?.provider && !isValidProvider(options.provider)) {
        return validationResult(false, 'Invalid provider');
      }
      return validationResult(true);
    }

    case 'paste-text': {
      const [text] = args;
      if (!isString(text)) {
        return validationResult(false, 'Invalid text');
      }
      return validationResult(true);
    }

    case 'save-transcription': {
      const [data] = args;
      if (!isValidTranscriptionData(data)) {
        return validationResult(false, 'Invalid transcription data');
      }
      return validationResult(true);
    }

    case 'get-transcriptions': {
      const [limit] = args;
      if (limit !== undefined && (!isNumber(limit) || limit < 1 || limit > 10000)) {
        return validationResult(false, 'Invalid limit');
      }
      return validationResult(true);
    }

    case 'set-api-key': {
      const [provider, key] = args;
      if (!isValidProvider(provider)) {
        return validationResult(false, 'Invalid provider');
      }
      if (!isString(key)) {
        return validationResult(false, 'Invalid key type');
      }
      // Allow empty string to clear key
      if (key !== '' && !isValidApiKey(key)) {
        return validationResult(false, 'Invalid API key format');
      }
      return validationResult(true);
    }

    case 'set-hotkey': {
      const [hotkey] = args;
      if (!isValidHotkey(hotkey)) {
        return validationResult(false, 'Invalid hotkey format');
      }
      return validationResult(true);
    }

    case 'read-log-file': {
      const [filename] = args;
      if (!isValidFilename(filename)) {
        return validationResult(false, 'Invalid filename');
      }
      return validationResult(true);
    }

    case 'clear-old-logs': {
      const [keepDays] = args;
      if (keepDays !== undefined && (!isPositiveInt(keepDays) || keepDays > 365)) {
        return validationResult(false, 'Invalid keepDays value');
      }
      return validationResult(true);
    }

    // Handlers that take no arguments or only need basic validation
    case 'get-api-keys':
    case 'check-encryption':
    case 'show-control-panel':
    case 'hide-control-panel':
    case 'get-logs-path':
    case 'list-log-files':
    case 'export-logs':
    case 'open-logs-folder':
    case 'get-app-version':
    case 'get-app-info':
    case 'get-hotkey':
    case 'get-available-hotkeys':
    case 'get-setting':
    case 'set-setting':
      return validationResult(true);

    default:
      // Unknown channel - reject
      return validationResult(false, `Unknown IPC channel: ${channel}`);
  }
}

module.exports = {
  isString,
  isNonEmptyString,
  isNumber,
  isPositiveInt,
  isBoolean,
  isArray,
  isObject,
  isValidAudioData,
  isValidApiKey,
  isValidHotkey,
  isValidProvider,
  isValidLanguage,
  isValidTranscriptionData,
  isValidFilename,
  sanitizeString,
  validateIpcMessage
};

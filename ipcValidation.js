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

  // Accepted prefixes:
  //   sk-       OpenAI (sk-proj-..., sk-...)
  //   sk-ant-   Anthropic
  //   gsk_      Groq
  const validPrefixes = ['sk-', 'sk-ant-', 'gsk_'];
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
 * Validate provider name. `groq` is accepted because since v1.9.0-beta.3
 * Murmullo can use Groq's OpenAI-compatible endpoint for transcription.
 */
function isValidProvider(value) {
  return ['openai', 'anthropic', 'groq'].includes(value);
}

/**
 * Validate language code
 */
function isValidLanguage(value) {
  return ['es', 'en', 'auto'].includes(value);
}

// Whitelist for processing_method on saved transcriptions. Kept in sync with
// App.jsx persistTranscription / fast-mode refinement flow. 'verbatim' was
// added when the verbatim mode shipped; 'none' is used for cancelled flows.
const VALID_PROCESSING_METHODS = ['fast', 'smart', 'verbatim', 'none'];

/**
 * Validate transcription data for saving / updating. The schema grew in cycle
 * 1 (processing_method, agent_name, error, is_processed) but isValid was not
 * tightened; cycle 2 H-203 adds defensive bounds.
 */
function isValidTranscriptionData(data) {
  if (!isObject(data)) return false;
  if (!isString(data.original_text)) return false;
  if (data.processed_text !== null && data.processed_text !== undefined && !isString(data.processed_text)) return false;

  if (data.processing_method !== undefined && data.processing_method !== null) {
    if (!isString(data.processing_method) || data.processing_method.length > 32) return false;
    if (!VALID_PROCESSING_METHODS.includes(data.processing_method)) return false;
  }

  if (data.agent_name !== undefined && data.agent_name !== null) {
    if (!isString(data.agent_name) || data.agent_name.length > 64) return false;
  }

  if (data.error !== undefined && data.error !== null) {
    if (!isString(data.error) || data.error.length > 500) return false;
  }

  if (data.is_processed !== undefined && data.is_processed !== null) {
    // Accept boolean or 0/1 (the SQLite handler coerces with `? 1 : 0`).
    if (typeof data.is_processed !== 'boolean' && data.is_processed !== 0 && data.is_processed !== 1) {
      return false;
    }
  }

  if (data.transport !== undefined && data.transport !== null) {
    if (!isString(data.transport) || data.transport.length > 32) return false;
  }

  return true;
}

/**
 * Validate the partial-update payload sent to update-transcription. id is
 * required, all other fields share the rules from isValidTranscriptionData.
 */
function isValidTranscriptionUpdate(data) {
  if (!isObject(data)) return false;
  if (!isPositiveInt(data.id)) return false;

  if (data.processed_text !== undefined && data.processed_text !== null && !isString(data.processed_text)) return false;

  if (data.processing_method !== undefined && data.processing_method !== null) {
    if (!isString(data.processing_method) || data.processing_method.length > 32) return false;
    if (!VALID_PROCESSING_METHODS.includes(data.processing_method)) return false;
  }

  if (data.agent_name !== undefined && data.agent_name !== null) {
    if (!isString(data.agent_name) || data.agent_name.length > 64) return false;
  }

  if (data.transport !== undefined && data.transport !== null) {
    if (!isString(data.transport) || data.transport.length > 32) return false;
  }

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
 * Validate dictionary entry
 */
function isValidDictionaryEntry(entry) {
  if (!isObject(entry)) return false;
  if (!isNonEmptyString(entry.find)) return false;
  if (!isNonEmptyString(entry.replace)) return false;
  if (entry.find.length > 100) return false;
  if (entry.replace.length > 200) return false;
  if (entry.soundsLike !== undefined && !isString(entry.soundsLike)) return false;
  if (entry.caseSensitive !== undefined && !isBoolean(entry.caseSensitive)) return false;
  if (entry.enabled !== undefined && !isBoolean(entry.enabled)) return false;
  return true;
}

/**
 * Validate dictionary structure
 */
function isValidDictionary(dict) {
  if (!isObject(dict)) return false;
  if (dict.entries !== undefined && !isArray(dict.entries)) return false;
  if (dict.settings !== undefined && !isObject(dict.settings)) return false;
  return true;
}

/**
 * Validate dictionary entry updates
 */
function isValidDictionaryEntryUpdates(updates) {
  if (!isObject(updates)) return false;
  if (updates.find !== undefined && !isString(updates.find)) return false;
  if (updates.replace !== undefined && !isString(updates.replace)) return false;
  if (updates.soundsLike !== undefined && !isString(updates.soundsLike)) return false;
  if (updates.caseSensitive !== undefined && !isBoolean(updates.caseSensitive)) return false;
  if (updates.enabled !== undefined && !isBoolean(updates.enabled)) return false;
  return true;
}

/**
 * Validate dictionary settings
 */
function isValidDictionarySettings(settings) {
  if (!isObject(settings)) return false;
  if (settings.maxWhisperPromptWords !== undefined && !isPositiveInt(settings.maxWhisperPromptWords)) return false;
  if (settings.enablePostProcessing !== undefined && !isBoolean(settings.enablePostProcessing)) return false;
  if (settings.enableWhisperHints !== undefined && !isBoolean(settings.enableWhisperHints)) return false;
  return true;
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

    case 'update-transcription': {
      const [data] = args;
      if (!isValidTranscriptionUpdate(data)) {
        return validationResult(false, 'Invalid transcription update payload');
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

    // Dictionary handlers
    case 'set-dictionary': {
      const [dict] = args;
      if (!isValidDictionary(dict)) {
        return validationResult(false, 'Invalid dictionary format');
      }
      return validationResult(true);
    }

    case 'add-dictionary-entry': {
      const [entry] = args;
      if (!isValidDictionaryEntry(entry)) {
        return validationResult(false, 'Invalid dictionary entry');
      }
      return validationResult(true);
    }

    case 'update-dictionary-entry': {
      const [id, updates] = args;
      if (!isNonEmptyString(id)) {
        return validationResult(false, 'Invalid entry ID');
      }
      if (!isValidDictionaryEntryUpdates(updates)) {
        return validationResult(false, 'Invalid entry updates');
      }
      return validationResult(true);
    }

    case 'delete-dictionary-entry': {
      const [id] = args;
      if (!isNonEmptyString(id)) {
        return validationResult(false, 'Invalid entry ID');
      }
      return validationResult(true);
    }

    case 'import-dictionary': {
      const [json] = args;
      // Allow string (JSON) or object
      if (!isString(json) && !isObject(json)) {
        return validationResult(false, 'Invalid import data');
      }
      return validationResult(true);
    }

    case 'test-replacement': {
      const [text] = args;
      if (!isString(text)) {
        return validationResult(false, 'Invalid text');
      }
      if (text.length > 10000) {
        return validationResult(false, 'Text too long');
      }
      return validationResult(true);
    }

    case 'update-dictionary-settings': {
      const [settings] = args;
      if (!isValidDictionarySettings(settings)) {
        return validationResult(false, 'Invalid dictionary settings');
      }
      return validationResult(true);
    }

    // Dictionary handlers that take no arguments
    case 'get-dictionary':
    case 'export-dictionary':
      return validationResult(true);

    // validate-api-key: live validation against provider API
    case 'validate-api-key': {
      const [provider, key] = args;
      if (!isValidProvider(provider)) {
        return validationResult(false, 'Invalid provider');
      }
      if (!isString(key) || !isValidApiKey(key)) {
        return validationResult(false, 'Invalid key format');
      }
      return validationResult(true);
    }

    // Backend auth channels
    case 'backend-login':
    case 'backend-register': {
      const [email, password] = args;
      if (!isNonEmptyString(email) || email.length > 254) {
        return validationResult(false, 'Invalid email');
      }
      if (!isNonEmptyString(password) || password.length < 8 || password.length > 200) {
        return validationResult(false, 'Invalid password');
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
    case 'get-usage':
    case 'reset-usage':
    case 'get-backend-settings':
    case 'check-backend-health':
    case 'backend-logout':
    case 'backend-get-me':
    case 'backend-get-usage':
    case 'get-update-status':
    case 'check-for-updates':
    case 'download-update':
    case 'install-update':
    case 'get-debug-audio-settings':
    case 'set-debug-audio-enabled':
    case 'open-debug-audio-folder':
    case 'clear-debug-audio':
    case 'window-start-drag':
    case 'window-drag-end':
    case 'set-backend-mode':
    case 'set-backend-url':
    case 'show-notification':
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
  isValidTranscriptionUpdate,
  isValidFilename,
  isValidDictionaryEntry,
  isValidDictionary,
  isValidDictionaryEntryUpdates,
  isValidDictionarySettings,
  sanitizeString,
  validateIpcMessage
};

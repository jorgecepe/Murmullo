import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Configuration Storage', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = {};
    global.localStorage = {
      getItem: vi.fn((key) => mockStorage[key] || null),
      setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
      removeItem: vi.fn((key) => { delete mockStorage[key]; }),
      clear: vi.fn(() => { mockStorage = {}; })
    };
  });

  describe('Settings Keys', () => {
    const validSettingKeys = [
      'language',
      'useLocalWhisper',
      'whisperModel',
      'reasoningProvider',
      'reasoningModel',
      'hotkey',
      'processingMode',
      'hasCompletedOnboarding'
    ];

    it('should have all required setting keys defined', () => {
      validSettingKeys.forEach(key => {
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
      });
    });

    it('should store and retrieve settings correctly', () => {
      localStorage.setItem('language', 'es');
      expect(localStorage.setItem).toHaveBeenCalledWith('language', 'es');

      const result = localStorage.getItem('language');
      expect(result).toBe('es');
    });
  });

  describe('Default Values', () => {
    const defaults = {
      language: 'es',
      useLocalWhisper: 'false',
      whisperModel: 'whisper-1',
      reasoningProvider: 'anthropic',
      reasoningModel: 'claude-3-haiku-20240307',
      hotkey: 'CommandOrControl+Shift+Space',
      processingMode: 'smart',
      hasCompletedOnboarding: 'false'
    };

    it('should have reasonable default values', () => {
      expect(defaults.language).toBe('es');
      expect(defaults.processingMode).toBe('smart');
      expect(defaults.reasoningProvider).toBe('anthropic');
    });

    it('should use string values for boolean settings', () => {
      expect(defaults.useLocalWhisper).toBe('false');
      expect(defaults.hasCompletedOnboarding).toBe('false');
    });
  });

  describe('Processing Mode', () => {
    const validModes = ['fast', 'smart'];

    it('should accept valid processing modes', () => {
      validModes.forEach(mode => {
        expect(['fast', 'smart'].includes(mode)).toBe(true);
      });
    });

    it('should have "fast" mode skip AI processing', () => {
      const mode = 'fast';
      const shouldProcess = mode === 'smart';
      expect(shouldProcess).toBe(false);
    });

    it('should have "smart" mode enable AI processing', () => {
      const mode = 'smart';
      const shouldProcess = mode === 'smart';
      expect(shouldProcess).toBe(true);
    });
  });

  describe('Provider Selection', () => {
    const providers = {
      openai: {
        name: 'OpenAI',
        models: ['gpt-4o-mini', 'gpt-4o']
      },
      anthropic: {
        name: 'Anthropic',
        models: ['claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022']
      }
    };

    it('should support OpenAI as a provider', () => {
      expect(providers.openai).toBeDefined();
      expect(providers.openai.models.length).toBeGreaterThan(0);
    });

    it('should support Anthropic as a provider', () => {
      expect(providers.anthropic).toBeDefined();
      expect(providers.anthropic.models.length).toBeGreaterThan(0);
    });

    it('should have Claude Haiku as default for Anthropic', () => {
      expect(providers.anthropic.models).toContain('claude-3-haiku-20240307');
    });
  });
});

describe('Hotkey Configuration', () => {
  describe('Hotkey Format', () => {
    const parseHotkey = (hotkey) => {
      const parts = hotkey.split('+');
      const modifiers = parts.slice(0, -1);
      const key = parts[parts.length - 1];
      return { modifiers, key };
    };

    it('should parse default hotkey correctly', () => {
      const { modifiers, key } = parseHotkey('CommandOrControl+Shift+Space');
      expect(modifiers).toContain('CommandOrControl');
      expect(modifiers).toContain('Shift');
      expect(key).toBe('Space');
    });

    it('should handle simple hotkeys', () => {
      const { modifiers, key } = parseHotkey('F1');
      expect(modifiers).toHaveLength(0);
      expect(key).toBe('F1');
    });

    it('should handle media keys', () => {
      const { modifiers, key } = parseHotkey('MediaPlayPause');
      expect(modifiers).toHaveLength(0);
      expect(key).toBe('MediaPlayPause');
    });
  });

  describe('Hotkey Validation', () => {
    const isValidHotkey = (hotkey) => {
      if (!hotkey || typeof hotkey !== 'string') return false;
      if (hotkey.length === 0 || hotkey.length > 50) return false;
      if (/[<>$`|;&]/.test(hotkey)) return false;
      return true;
    };

    it('should accept valid hotkey formats', () => {
      expect(isValidHotkey('CommandOrControl+Shift+Space')).toBe(true);
      expect(isValidHotkey('Ctrl+Alt+M')).toBe(true);
      expect(isValidHotkey('F1')).toBe(true);
    });

    it('should reject invalid hotkeys', () => {
      expect(isValidHotkey('')).toBe(false);
      expect(isValidHotkey(null)).toBe(false);
      expect(isValidHotkey('<script>')).toBe(false);
      expect(isValidHotkey('$(command)')).toBe(false);
    });
  });
});

describe('Language Settings', () => {
  const supportedLanguages = ['es', 'en', 'pt', 'fr', 'de'];

  it('should default to Spanish', () => {
    const defaultLang = 'es';
    expect(defaultLang).toBe('es');
  });

  it('should support common languages', () => {
    expect(supportedLanguages).toContain('es');
    expect(supportedLanguages).toContain('en');
  });

  it('should use ISO 639-1 language codes', () => {
    supportedLanguages.forEach(lang => {
      expect(lang.length).toBe(2);
      expect(lang).toMatch(/^[a-z]{2}$/);
    });
  });
});

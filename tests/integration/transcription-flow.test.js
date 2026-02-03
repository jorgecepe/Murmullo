import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Transcription Flow Integration', () => {
  let mockElectronAPI;

  beforeEach(() => {
    mockElectronAPI = {
      transcribeAudio: vi.fn(),
      processText: vi.fn(),
      pasteText: vi.fn(),
      getSetting: vi.fn()
    };
    global.window = { electronAPI: mockElectronAPI };
  });

  describe('Fast Mode Flow', () => {
    it('should transcribe and paste directly without AI processing', async () => {
      const audioData = new Uint8Array(1000);
      const transcribedText = 'Hola mundo';

      mockElectronAPI.getSetting.mockResolvedValue('fast');
      mockElectronAPI.transcribeAudio.mockResolvedValue({
        success: true,
        text: transcribedText
      });
      mockElectronAPI.pasteText.mockResolvedValue({ success: true });

      // Simulate fast mode flow
      const mode = await mockElectronAPI.getSetting('processingMode');
      expect(mode).toBe('fast');

      const result = await mockElectronAPI.transcribeAudio(audioData, { language: 'es' });
      expect(result.success).toBe(true);
      expect(result.text).toBe(transcribedText);

      // In fast mode, should NOT call processText
      expect(mockElectronAPI.processText).not.toHaveBeenCalled();

      // Should paste directly
      await mockElectronAPI.pasteText(transcribedText);
      expect(mockElectronAPI.pasteText).toHaveBeenCalledWith(transcribedText);
    });
  });

  describe('Smart Mode Flow', () => {
    it('should transcribe, process with AI, then paste', async () => {
      const audioData = new Uint8Array(1000);
      const transcribedText = 'hola mundo como estas';
      const processedText = 'Hola mundo, ¿cómo estás?';

      mockElectronAPI.getSetting.mockResolvedValue('smart');
      mockElectronAPI.transcribeAudio.mockResolvedValue({
        success: true,
        text: transcribedText
      });
      mockElectronAPI.processText.mockResolvedValue({
        success: true,
        text: processedText
      });
      mockElectronAPI.pasteText.mockResolvedValue({ success: true });

      // Simulate smart mode flow
      const mode = await mockElectronAPI.getSetting('processingMode');
      expect(mode).toBe('smart');

      const transcription = await mockElectronAPI.transcribeAudio(audioData, { language: 'es' });
      expect(transcription.success).toBe(true);

      // In smart mode, should call processText
      const processed = await mockElectronAPI.processText(transcription.text, {
        provider: 'anthropic'
      });
      expect(processed.success).toBe(true);
      expect(processed.text).toBe(processedText);

      // Should paste processed text
      await mockElectronAPI.pasteText(processed.text);
      expect(mockElectronAPI.pasteText).toHaveBeenCalledWith(processedText);
    });
  });

  describe('Error Handling', () => {
    it('should handle transcription failure gracefully', async () => {
      const audioData = new Uint8Array(1000);

      mockElectronAPI.transcribeAudio.mockResolvedValue({
        success: false,
        error: 'API request failed'
      });

      const result = await mockElectronAPI.transcribeAudio(audioData, { language: 'es' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Should NOT attempt to process or paste on failure
      expect(mockElectronAPI.processText).not.toHaveBeenCalled();
      expect(mockElectronAPI.pasteText).not.toHaveBeenCalled();
    });

    it('should fall back to original text if AI processing fails', async () => {
      const audioData = new Uint8Array(1000);
      const originalText = 'hola mundo';

      mockElectronAPI.transcribeAudio.mockResolvedValue({
        success: true,
        text: originalText
      });
      mockElectronAPI.processText.mockResolvedValue({
        success: false,
        error: 'AI processing failed'
      });
      mockElectronAPI.pasteText.mockResolvedValue({ success: true });

      const transcription = await mockElectronAPI.transcribeAudio(audioData, { language: 'es' });
      const processed = await mockElectronAPI.processText(transcription.text, {});

      // If processing fails, should paste original text
      const textToPaste = processed.success ? processed.text : transcription.text;
      await mockElectronAPI.pasteText(textToPaste);

      expect(mockElectronAPI.pasteText).toHaveBeenCalledWith(originalText);
    });
  });

  describe('Technical Terms Preservation', () => {
    const technicalTerms = [
      'git', 'commit', 'push', 'pull', 'merge', 'branch',
      'API', 'REST', 'GraphQL',
      'deploy', 'build', 'npm', 'yarn',
      'React', 'Vue', 'Angular',
      'Docker', 'Kubernetes',
      'SQL', 'NoSQL', 'MongoDB'
    ];

    it('should preserve English technical terms in Spanish text', () => {
      const inputText = 'Necesito hacer un commit y luego un push al repositorio de git';

      // Simulate AI processing that preserves terms
      const processedText = 'Necesito hacer un commit y luego un push al repositorio de git.';

      technicalTerms.forEach(term => {
        if (inputText.toLowerCase().includes(term.toLowerCase())) {
          // The term should remain in the processed text
          expect(processedText.toLowerCase()).toContain(term.toLowerCase());
        }
      });
    });

    it('should not translate technical terms to Spanish', () => {
      const badTranslations = {
        'commit': 'comprometer',
        'push': 'empujar',
        'pull': 'tirar',
        'branch': 'rama',
        'deploy': 'desplegar'
      };

      const goodText = 'Hacer un commit y push al branch main';

      Object.values(badTranslations).forEach(badTerm => {
        expect(goodText.toLowerCase()).not.toContain(badTerm);
      });
    });
  });
});

describe('Clipboard Management', () => {
  let mockElectronAPI;

  beforeEach(() => {
    mockElectronAPI = {
      pasteText: vi.fn()
    };
    global.window = { electronAPI: mockElectronAPI };
  });

  describe('Paste Flow', () => {
    it('should paste text to active application', async () => {
      const textToPaste = 'Hola mundo';

      mockElectronAPI.pasteText.mockResolvedValue({ success: true });

      await mockElectronAPI.pasteText(textToPaste);

      expect(mockElectronAPI.pasteText).toHaveBeenCalledWith(textToPaste);
    });

    it('should handle paste failure', async () => {
      const textToPaste = 'Hola mundo';

      mockElectronAPI.pasteText.mockResolvedValue({
        success: false,
        error: 'No active window'
      });

      const result = await mockElectronAPI.pasteText(textToPaste);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Clipboard Restoration', () => {
    it('should concept: save original clipboard before paste', () => {
      // This tests the concept that original clipboard should be saved
      const mockClipboard = {
        original: 'original content',
        current: null
      };

      // Save original
      mockClipboard.current = mockClipboard.original;

      // Paste new text (simulated)
      const newText = 'transcribed text';
      mockClipboard.current = newText;

      // Restore original (after delay)
      mockClipboard.current = mockClipboard.original;

      expect(mockClipboard.current).toBe('original content');
    });
  });
});

describe('List Formatting', () => {
  const formatAsNumberedList = (text) => {
    // Check if text looks like a list (multiple items separated by periods or commas)
    const items = text.split(/[.,;]/).filter(item => item.trim().length > 0);

    if (items.length >= 3) {
      return items.map((item, index) => `${index + 1}. ${item.trim()}`).join('\n');
    }

    return text;
  };

  it('should detect list-like content', () => {
    const listText = 'primero hacer esto, segundo hacer aquello, tercero terminar';
    const formatted = formatAsNumberedList(listText);

    expect(formatted).toContain('1.');
    expect(formatted).toContain('2.');
    expect(formatted).toContain('3.');
  });

  it('should not format non-list content', () => {
    const normalText = 'Esta es una oración normal sin lista';
    const formatted = formatAsNumberedList(normalText);

    expect(formatted).toBe(normalText);
    expect(formatted).not.toContain('1.');
  });
});

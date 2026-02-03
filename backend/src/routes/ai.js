import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { authenticate, checkUsageQuota } from '../middleware/auth.js';
import { processText } from '../services/aiService.js';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Rate limiting for AI endpoint
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: { error: 'Too many AI requests, please wait' }
});

/**
 * POST /api/v1/ai/process
 * Process text with AI (grammar correction, formatting)
 */
router.post('/process',
  authenticate,
  checkUsageQuota,
  aiLimiter,
  [
    body('text').notEmpty().isLength({ max: 10000 }).withMessage('Text is required (max 10000 chars)'),
    body('provider').optional().isIn(['anthropic', 'openai']).withMessage('Invalid provider'),
    body('model').optional().isString().withMessage('Invalid model')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { text, provider = 'anthropic', model } = req.body;

      // Check if text is too short to process
      if (text.trim().length < 3) {
        return res.json({
          success: true,
          text: text,
          processed: false,
          message: 'Text too short to process'
        });
      }

      // Process text with AI
      const result = await processText(text, { provider, model });

      logger.info('AI processing completed', {
        userId: req.user.id,
        provider,
        latency: result.latency
      });

      res.json({
        success: true,
        text: result.text,
        processed: true,
        metadata: {
          provider: result.provider,
          model: result.model,
          latency_ms: result.latency,
          input_length: text.length,
          output_length: result.text.length
        }
      });

    } catch (error) {
      // If AI processing fails, return original text
      logger.warn('AI processing failed, returning original', {
        userId: req.user.id,
        error: error.message
      });

      res.json({
        success: true,
        text: req.body.text,
        processed: false,
        error: 'AI processing failed, returning original text'
      });
    }
  }
);

/**
 * POST /api/v1/ai/transcribe-and-process
 * Combined endpoint: transcribe audio and process with AI
 */
router.post('/transcribe-and-process',
  authenticate,
  checkUsageQuota,
  aiLimiter,
  [
    body('audio').notEmpty().withMessage('Audio data is required'),
    body('language').optional().isIn(['es', 'en', 'pt', 'fr', 'de']),
    body('provider').optional().isIn(['anthropic', 'openai']),
    body('skipProcessing').optional().isBoolean()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        audio,
        language = 'es',
        provider = 'anthropic',
        skipProcessing = false
      } = req.body;

      // Import whisper service
      const { transcribeAudio, estimateAudioDuration } = await import('../services/whisperService.js');

      // Decode and validate audio
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (e) {
        return res.status(400).json({ error: 'Invalid audio data format' });
      }

      if (audioBuffer.length > 25 * 1024 * 1024) {
        return res.status(400).json({ error: 'Audio file too large (max 25MB)' });
      }

      // Step 1: Transcribe
      const transcriptionResult = await transcribeAudio(audioBuffer, { language });
      const estimatedDuration = estimateAudioDuration(audioBuffer.length);

      let finalText = transcriptionResult.text;
      let aiResult = null;

      // Step 2: Process with AI (unless skipped)
      if (!skipProcessing && transcriptionResult.text.trim().length > 3) {
        try {
          aiResult = await processText(transcriptionResult.text, { provider });
          finalText = aiResult.text;
        } catch (aiError) {
          logger.warn('AI processing failed in combined endpoint', { error: aiError.message });
          // Continue with original transcription
        }
      }

      // Update usage
      await db.incrementUsage(req.user.id, estimatedDuration / 60);

      // Log transcription
      await db.logTranscription({
        userId: req.user.id,
        durationSeconds: estimatedDuration,
        wordCount: finalText.split(/\s+/).length,
        provider: 'whisper',
        aiProvider: aiResult ? aiResult.provider : null
      });

      logger.info('Combined transcription completed', {
        userId: req.user.id,
        durationSeconds: estimatedDuration,
        aiProcessed: !!aiResult
      });

      res.json({
        success: true,
        text: finalText,
        original_text: transcriptionResult.text,
        ai_processed: !!aiResult,
        metadata: {
          language,
          duration_seconds: estimatedDuration,
          transcription_latency_ms: transcriptionResult.latency,
          ai_latency_ms: aiResult?.latency || 0,
          total_latency_ms: transcriptionResult.latency + (aiResult?.latency || 0),
          word_count: finalText.split(/\s+/).length,
          provider: aiResult?.provider || null
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/ai/providers
 * Get available AI providers and models
 */
router.get('/providers', authenticate, (req, res) => {
  res.json({
    providers: [
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        models: [
          { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', recommended: true },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' }
        ],
        default_model: 'claude-3-haiku-20240307'
      },
      {
        id: 'openai',
        name: 'OpenAI GPT',
        models: [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', recommended: true },
          { id: 'gpt-4o', name: 'GPT-4o' }
        ],
        default_model: 'gpt-4o-mini'
      }
    ],
    default_provider: 'anthropic'
  });
});

export default router;

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { authenticate, checkUsageQuota } from '../middleware/auth.js';
import { transcribeAudio, estimateAudioDuration } from '../services/whisperService.js';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Rate limiting for transcription endpoint
const transcriptionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { error: 'Too many transcription requests, please wait' }
});

/**
 * POST /api/v1/transcription
 * Transcribe audio to text
 */
router.post('/',
  authenticate,
  checkUsageQuota,
  transcriptionLimiter,
  [
    body('audio').notEmpty().withMessage('Audio data is required'),
    body('language').optional().isIn(['es', 'en', 'pt', 'fr', 'de']).withMessage('Invalid language'),
    body('model').optional().isIn(['whisper-1']).withMessage('Invalid model')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { audio, language = 'es', model = 'whisper-1' } = req.body;

      // Decode base64 audio
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (e) {
        return res.status(400).json({ error: 'Invalid audio data format' });
      }

      // Validate audio size
      const maxSize = 25 * 1024 * 1024; // 25MB (Whisper limit)
      if (audioBuffer.length > maxSize) {
        return res.status(400).json({ error: 'Audio file too large (max 25MB)' });
      }

      const minSize = 1000; // 1KB minimum
      if (audioBuffer.length < minSize) {
        return res.status(400).json({ error: 'Audio file too small' });
      }

      // Estimate duration for usage tracking
      const estimatedDuration = estimateAudioDuration(audioBuffer.length);
      const durationMinutes = estimatedDuration / 60;

      // Transcribe audio
      const result = await transcribeAudio(audioBuffer, { language, model });

      // Update usage
      await db.incrementUsage(req.user.id, durationMinutes);

      // Log transcription (without content for privacy)
      await db.logTranscription({
        userId: req.user.id,
        durationSeconds: estimatedDuration,
        wordCount: result.text.split(/\s+/).length,
        provider: 'whisper'
      });

      logger.info('Transcription completed', {
        userId: req.user.id,
        durationSeconds: estimatedDuration,
        latency: result.latency
      });

      res.json({
        success: true,
        text: result.text,
        metadata: {
          language,
          model,
          duration_seconds: estimatedDuration,
          latency_ms: result.latency,
          word_count: result.text.split(/\s+/).length
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/transcription/usage
 * Get user's transcription usage stats
 */
router.get('/usage', authenticate, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.id);
    const stats = await db.getUserStats(req.user.id);

    const planLimits = {
      free: 30,
      pro: 300,
      business: -1
    };

    const limit = planLimits[user.plan] || planLimits.free;

    res.json({
      plan: user.plan,
      usage: {
        minutes_used: parseFloat(user.usage_minutes_this_month) || 0,
        minutes_limit: limit,
        minutes_remaining: limit === -1 ? -1 : Math.max(0, limit - user.usage_minutes_this_month),
        percentage_used: limit === -1 ? 0 : Math.round((user.usage_minutes_this_month / limit) * 100)
      },
      stats: {
        total_transcriptions: parseInt(stats.total_transcriptions) || 0,
        total_minutes: parseFloat(stats.total_duration_seconds / 60) || 0,
        total_words: parseInt(stats.total_words) || 0
      },
      reset_date: getNextMonthStart()
    });

  } catch (error) {
    next(error);
  }
});

function getNextMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

export default router;

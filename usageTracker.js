/**
 * Free-Tier Usage Tracker for Murmullo v1.9
 *
 * Tracks minutes of audio transcribed under the local/BYOK (bring-your-own-key) flow.
 *
 * Business rules:
 *   - First FREE_TIER_MINUTES of transcription are free (Murmullo covers cost via bundled demo key,
 *     or the user trials with their own key at no ceiling other than OpenAI's own billing).
 *   - After free tier is exhausted, the user must either:
 *       (a) Supply their own API key and continue (no Murmullo-imposed ceiling),
 *       (b) Authenticate with the backend and use a paid plan.
 *   - Backend-authenticated users don't consume this counter (backend enforces its own limits).
 *
 * Persistence:
 *   - Stored in %APPDATA%/murmullo/usage.json
 *   - Only accumulates successful transcriptions (failed calls don't count)
 *   - Durations are computed from the recorded audio, not wall-clock, so pauses don't count.
 */

const fs = require('fs');
const path = require('path');

const FREE_TIER_MINUTES = 30;
const FREE_TIER_SECONDS = FREE_TIER_MINUTES * 60;

class UsageTracker {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          return {
            totalSeconds: Number(parsed.totalSeconds) || 0,
            transcriptionCount: Number(parsed.transcriptionCount) || 0,
            firstUseAt: parsed.firstUseAt || null,
            lastUseAt: parsed.lastUseAt || null,
            hasOwnApiKey: !!parsed.hasOwnApiKey
          };
        }
      }
    } catch (err) {
      console.error('[UsageTracker] Failed to load:', err.message);
    }
    return {
      totalSeconds: 0,
      transcriptionCount: 0,
      firstUseAt: null,
      lastUseAt: null,
      hasOwnApiKey: false
    };
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('[UsageTracker] Failed to save:', err.message);
    }
  }

  /**
   * Record a successful transcription.
   * @param {number} durationSeconds Audio duration in seconds
   */
  record(durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    const now = new Date().toISOString();
    this.data.totalSeconds += durationSeconds;
    this.data.transcriptionCount += 1;
    this.data.lastUseAt = now;
    if (!this.data.firstUseAt) this.data.firstUseAt = now;
    this._save();
  }

  /**
   * Flag that user has configured their own API key (so future usage skips the ceiling).
   */
  markOwnApiKey(has) {
    this.data.hasOwnApiKey = !!has;
    this._save();
  }

  /**
   * Check if user can still transcribe under the free tier.
   * @param {Object} opts
   * @param {boolean} opts.backendAuthenticated If true, always allow (backend enforces its own limits).
   * @returns {{allowed: boolean, reason?: string, secondsUsed: number, secondsLimit: number, secondsRemaining: number, percent: number}}
   */
  canTranscribe({ backendAuthenticated = false } = {}) {
    const secondsUsed = this.data.totalSeconds;
    const secondsLimit = FREE_TIER_SECONDS;
    const secondsRemaining = Math.max(0, secondsLimit - secondsUsed);
    const percent = Math.min(100, (secondsUsed / secondsLimit) * 100);

    if (backendAuthenticated) {
      return { allowed: true, secondsUsed, secondsLimit, secondsRemaining: Infinity, percent };
    }
    if (this.data.hasOwnApiKey) {
      // User supplied their own key: no Murmullo ceiling (they pay their provider directly).
      return { allowed: true, secondsUsed, secondsLimit, secondsRemaining: Infinity, percent };
    }
    if (secondsRemaining <= 0) {
      return {
        allowed: false,
        reason: 'free_tier_exhausted',
        secondsUsed,
        secondsLimit,
        secondsRemaining: 0,
        percent: 100
      };
    }
    return { allowed: true, secondsUsed, secondsLimit, secondsRemaining, percent };
  }

  /**
   * Summary for UI display.
   */
  summary() {
    return {
      totalSeconds: this.data.totalSeconds,
      totalMinutes: this.data.totalSeconds / 60,
      transcriptionCount: this.data.transcriptionCount,
      firstUseAt: this.data.firstUseAt,
      lastUseAt: this.data.lastUseAt,
      hasOwnApiKey: this.data.hasOwnApiKey,
      freeTierMinutes: FREE_TIER_MINUTES,
      freeTierSeconds: FREE_TIER_SECONDS
    };
  }

  /**
   * Reset tracker (for testing or admin reset).
   */
  reset() {
    this.data = {
      totalSeconds: 0,
      transcriptionCount: 0,
      firstUseAt: null,
      lastUseAt: null,
      hasOwnApiKey: this.data.hasOwnApiKey
    };
    this._save();
  }
}

module.exports = UsageTracker;
module.exports.FREE_TIER_MINUTES = FREE_TIER_MINUTES;
module.exports.FREE_TIER_SECONDS = FREE_TIER_SECONDS;

/**
 * Rate Limiter for IPC Handlers
 *
 * Token-bucket rate limiting per-channel to protect against:
 *   - Runaway renderer loops that burn API quota
 *   - Malicious XSS in renderer attempting to exhaust resources
 *   - Accidental infinite loops in UI code
 *
 * Usage:
 *   const limiter = new RateLimiter();
 *   if (!limiter.allow('transcribe-audio', 6, 60_000)) {
 *     throw new Error('Rate limit exceeded');
 *   }
 *
 * Limits are intentionally generous: legitimate users won't hit them,
 * but a compromised renderer cannot dump infinite API calls.
 */

class RateLimiter {
  constructor() {
    this.buckets = new Map();
    // Per-channel policy (maxCalls, windowMs)
    // Tune these if you observe false positives.
    this.policies = {
      'transcribe-audio':      { max: 10,  windowMs: 60_000 },  // 10/min max transcriptions
      'process-text':          { max: 20,  windowMs: 60_000 },  // 20/min AI post-process
      'paste-text':            { max: 30,  windowMs: 60_000 },
      'set-api-key':           { max: 10,  windowMs: 60_000 },
      'set-setting':           { max: 60,  windowMs: 60_000 },
      'save-transcription':    { max: 30,  windowMs: 60_000 },
      'backend-login':         { max: 5,   windowMs: 60_000 },  // brute-force defense
      'backend-register':      { max: 3,   windowMs: 60_000 },
      'check-for-updates':     { max: 6,   windowMs: 60_000 },
      'download-update':       { max: 3,   windowMs: 60_000 },
      // Default for any channel not listed (applied via allowDefault)
      '__default__':           { max: 120, windowMs: 60_000 }
    };
  }

  /**
   * Check if a call is allowed; consume a token if so.
   * @param {string} channel
   * @returns {{ok: boolean, retryAfterMs?: number, remaining?: number}}
   */
  check(channel) {
    const policy = this.policies[channel] || this.policies.__default__;
    const now = Date.now();
    let bucket = this.buckets.get(channel);
    if (!bucket) {
      bucket = { tokens: policy.max, resetAt: now + policy.windowMs };
      this.buckets.set(channel, bucket);
    }
    // Refill window expired -> reset
    if (now >= bucket.resetAt) {
      bucket.tokens = policy.max;
      bucket.resetAt = now + policy.windowMs;
    }
    if (bucket.tokens <= 0) {
      return { ok: false, retryAfterMs: bucket.resetAt - now, remaining: 0 };
    }
    bucket.tokens -= 1;
    return { ok: true, remaining: bucket.tokens };
  }

  /**
   * Get current usage (for diagnostics / UI counters)
   */
  snapshot(channel) {
    const bucket = this.buckets.get(channel);
    const policy = this.policies[channel] || this.policies.__default__;
    if (!bucket) return { used: 0, max: policy.max, resetInMs: 0 };
    return {
      used: policy.max - bucket.tokens,
      max: policy.max,
      resetInMs: Math.max(0, bucket.resetAt - Date.now())
    };
  }

  /**
   * Reset a channel (for testing)
   */
  reset(channel) {
    if (channel) this.buckets.delete(channel);
    else this.buckets.clear();
  }
}

module.exports = RateLimiter;

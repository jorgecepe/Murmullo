/**
 * Rate Limiter unit tests.
 *
 * These verify that per-channel token buckets correctly refill after their
 * window expires and that they reject calls once exhausted. This is the
 * primary defense against runaway IPC loops burning API quota.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import RateLimiter from '../../../rateLimiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T12:00:00Z'));
  });

  it('allows calls up to the channel max', () => {
    // transcribe-audio policy is 10 per minute
    for (let i = 0; i < 10; i++) {
      const r = limiter.check('transcribe-audio');
      expect(r.ok).toBe(true);
    }
  });

  it('rejects calls after the channel max is exhausted', () => {
    for (let i = 0; i < 10; i++) limiter.check('transcribe-audio');
    const r = limiter.check('transcribe-audio');
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.remaining).toBe(0);
  });

  it('refills tokens after the window expires', () => {
    for (let i = 0; i < 10; i++) limiter.check('transcribe-audio');
    expect(limiter.check('transcribe-audio').ok).toBe(false);
    vi.advanceTimersByTime(61_000);
    const r = limiter.check('transcribe-audio');
    expect(r.ok).toBe(true);
  });

  it('uses the default policy for unknown channels', () => {
    // __default__ allows 120 per minute
    for (let i = 0; i < 120; i++) {
      expect(limiter.check('some-new-channel').ok).toBe(true);
    }
    expect(limiter.check('some-new-channel').ok).toBe(false);
  });

  it('applies stricter limits to auth endpoints (brute-force defense)', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('backend-login').ok).toBe(true);
    }
    expect(limiter.check('backend-login').ok).toBe(false);
  });

  it('tracks channels independently', () => {
    for (let i = 0; i < 10; i++) limiter.check('transcribe-audio');
    expect(limiter.check('transcribe-audio').ok).toBe(false);
    // Different channel should still be allowed
    expect(limiter.check('process-text').ok).toBe(true);
  });

  it('snapshot reports correct usage', () => {
    limiter.check('transcribe-audio');
    limiter.check('transcribe-audio');
    const snap = limiter.snapshot('transcribe-audio');
    expect(snap.used).toBe(2);
    expect(snap.max).toBe(10);
    expect(snap.resetInMs).toBeGreaterThan(0);
  });

  it('reset clears all buckets', () => {
    for (let i = 0; i < 10; i++) limiter.check('transcribe-audio');
    expect(limiter.check('transcribe-audio').ok).toBe(false);
    limiter.reset();
    expect(limiter.check('transcribe-audio').ok).toBe(true);
  });
});

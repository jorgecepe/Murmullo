/**
 * UsageTracker unit tests.
 *
 * Verifies free-tier accounting and that the BYOK/backend paths
 * correctly bypass the 30-minute ceiling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import UsageTracker, { FREE_TIER_SECONDS, FREE_TIER_MINUTES } from '../../../usageTracker.js';

let tmpPath;

beforeEach(() => {
  tmpPath = path.join(os.tmpdir(), `murmullo-usage-test-${Date.now()}-${Math.random()}.json`);
});

afterEach(() => {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
});

describe('UsageTracker', () => {
  it('starts with zero usage for a fresh install', () => {
    const tracker = new UsageTracker(tmpPath);
    const s = tracker.summary();
    expect(s.totalSeconds).toBe(0);
    expect(s.transcriptionCount).toBe(0);
    expect(s.freeTierMinutes).toBe(FREE_TIER_MINUTES);
  });

  it('accumulates seconds across multiple recordings', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.record(30);
    tracker.record(45.5);
    expect(tracker.summary().totalSeconds).toBeCloseTo(75.5);
    expect(tracker.summary().transcriptionCount).toBe(2);
  });

  it('rejects invalid durations', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.record(-1);
    tracker.record(0);
    tracker.record(NaN);
    tracker.record('10');
    expect(tracker.summary().totalSeconds).toBe(0);
  });

  it('persists across instances (restart survives)', () => {
    const t1 = new UsageTracker(tmpPath);
    t1.record(60);
    const t2 = new UsageTracker(tmpPath);
    expect(t2.summary().totalSeconds).toBe(60);
    expect(t2.summary().transcriptionCount).toBe(1);
  });

  it('blocks transcription once free tier is exhausted (BYOK=false, backend=false)', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.record(FREE_TIER_SECONDS);
    const gate = tracker.canTranscribe({ backendAuthenticated: false });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('free_tier_exhausted');
  });

  it('always allows when backend is authenticated', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.record(FREE_TIER_SECONDS + 1000);
    const gate = tracker.canTranscribe({ backendAuthenticated: true });
    expect(gate.allowed).toBe(true);
    expect(gate.secondsRemaining).toBe(Infinity);
  });

  it('always allows when user brings their own API key', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.markOwnApiKey(true);
    tracker.record(FREE_TIER_SECONDS + 1000);
    const gate = tracker.canTranscribe({ backendAuthenticated: false });
    expect(gate.allowed).toBe(true);
    expect(gate.secondsRemaining).toBe(Infinity);
  });

  it('reports correct percent and remaining seconds', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.record(FREE_TIER_SECONDS / 2);
    const gate = tracker.canTranscribe({ backendAuthenticated: false });
    expect(gate.percent).toBeCloseTo(50, 1);
    expect(gate.secondsRemaining).toBeCloseTo(FREE_TIER_SECONDS / 2, 1);
  });

  it('reset zeroes counters but preserves BYOK flag', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.markOwnApiKey(true);
    tracker.record(100);
    tracker.reset();
    expect(tracker.summary().totalSeconds).toBe(0);
    expect(tracker.summary().hasOwnApiKey).toBe(true);
  });

  it('stores firstUseAt only on the very first recording', () => {
    const tracker = new UsageTracker(tmpPath);
    tracker.record(10);
    const first = tracker.summary().firstUseAt;
    tracker.record(10);
    expect(tracker.summary().firstUseAt).toBe(first);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the fetchWithRetry function logic (since main.js can't be imported in jsdom)
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await global.fetch(url, options);
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

describe('fetchWithRetry', () => {
  let mockFetch;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return response on first successful call', async () => {
    const mockResponse = { ok: true, status: 200 };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry('https://api.example.com/test');

    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry on 4xx client errors', async () => {
    const mockResponse = { ok: false, status: 400 };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry('https://api.example.com/test');

    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should retry on 5xx server errors', async () => {
    const serverError = { ok: false, status: 500 };
    const successResponse = { ok: true, status: 200 };

    mockFetch
      .mockResolvedValueOnce(serverError)
      .mockResolvedValueOnce(successResponse);

    const promise = fetchWithRetry('https://api.example.com/test', {}, 3);

    // Advance past first retry delay
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result).toBe(successResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should retry on network errors', async () => {
    const networkError = new Error('Network error');
    const successResponse = { ok: true, status: 200 };

    mockFetch
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(successResponse);

    const promise = fetchWithRetry('https://api.example.com/test', {}, 3);

    // Advance past first retry delay
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result).toBe(successResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries exhausted', async () => {
    const networkError = new Error('Network error');
    mockFetch.mockRejectedValue(networkError);

    // Create the promise and immediately attach a catch to prevent unhandled rejection
    let caughtError = null;
    const promise = fetchWithRetry('https://api.example.com/test', {}, 3)
      .catch(e => { caughtError = e; });

    // Run all pending timers to completion
    await vi.runAllTimersAsync();

    // Wait for promise to settle
    await promise;

    // Verify the error was thrown
    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError.message).toBe('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff with max 5 seconds', async () => {
    const serverError = { ok: false, status: 503 };
    mockFetch.mockResolvedValue(serverError);

    // Don't await, we just want to verify the delays
    fetchWithRetry('https://api.example.com/test', {}, 5).catch(() => {});

    // First call is immediate
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // After 1s: second call (delay = 1000 * 2^0 = 1000)
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // After 2s more: third call (delay = 1000 * 2^1 = 2000)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // After 4s more: fourth call (delay = 1000 * 2^2 = 4000)
    await vi.advanceTimersByTimeAsync(4000);
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // After 5s more: fifth call (delay capped at 5000)
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('should pass through options to fetch', async () => {
    const mockResponse = { ok: true, status: 200 };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    };

    await fetchWithRetry('https://api.example.com/test', options);

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/test', options);
  });
});

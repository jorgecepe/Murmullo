/**
 * API Client for Murmullo Backend
 * Handles all communication with the backend server
 */

// Backend URL - can be overridden in settings
const DEFAULT_API_URL = 'http://localhost:3000';

class ApiClient {
  constructor() {
    this.baseUrl = localStorage.getItem('apiUrl') || DEFAULT_API_URL;
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  /**
   * Set the API base URL
   */
  setBaseUrl(url) {
    this.baseUrl = url;
    localStorage.setItem('apiUrl', url);
  }

  /**
   * Get the current API base URL
   */
  getBaseUrl() {
    return this.baseUrl;
  }

  /**
   * Set authentication tokens
   */
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  /**
   * Clear authentication tokens (logout)
   */
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.accessToken;
  }

  /**
   * Make an authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle 401 - try to refresh token
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry request with new token
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return this.handleResponse(retryResponse);
        }
      }

      return this.handleResponse(response);

    } catch (error) {
      console.error('API request failed:', error);
      throw new Error(`Network error: ${error.message}`);
    }
  }

  /**
   * Handle API response
   */
  async handleResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken() {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });

      if (!response.ok) {
        this.clearTokens();
        return false;
      }

      const data = await response.json();
      this.setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      return true;

    } catch (error) {
      this.clearTokens();
      return false;
    }
  }

  // ==================== Auth Endpoints ====================

  async register(email, password, name) {
    const data = await this.request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    this.setTokens(data.tokens.accessToken, data.tokens.refreshToken);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setTokens(data.tokens.accessToken, data.tokens.refreshToken);
    return data;
  }

  async logout() {
    try {
      await this.request('/api/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });
    } finally {
      this.clearTokens();
    }
  }

  async getMe() {
    return this.request('/api/v1/auth/me');
  }

  // ==================== Transcription Endpoints ====================

  /**
   * Transcribe audio via backend
   * @param {ArrayBuffer|Uint8Array} audioData - Audio data
   * @param {Object} options - Transcription options
   */
  async transcribe(audioData, options = {}) {
    // Convert to base64
    const base64Audio = this.arrayBufferToBase64(audioData);

    return this.request('/api/v1/transcription', {
      method: 'POST',
      body: JSON.stringify({
        audio: base64Audio,
        language: options.language || 'es',
        model: options.model || 'whisper-1'
      })
    });
  }

  async getUsage() {
    return this.request('/api/v1/transcription/usage');
  }

  // ==================== AI Endpoints ====================

  async processText(text, options = {}) {
    return this.request('/api/v1/ai/process', {
      method: 'POST',
      body: JSON.stringify({
        text,
        provider: options.provider || 'anthropic',
        model: options.model
      })
    });
  }

  async transcribeAndProcess(audioData, options = {}) {
    const base64Audio = this.arrayBufferToBase64(audioData);

    return this.request('/api/v1/ai/transcribe-and-process', {
      method: 'POST',
      body: JSON.stringify({
        audio: base64Audio,
        language: options.language || 'es',
        provider: options.provider || 'anthropic',
        skipProcessing: options.skipProcessing || false
      })
    });
  }

  async getProviders() {
    return this.request('/api/v1/ai/providers');
  }

  // ==================== User Endpoints ====================

  async getProfile() {
    return this.request('/api/v1/user/profile');
  }

  async updateProfile(data) {
    return this.request('/api/v1/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/api/v1/user/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  async getSubscription() {
    return this.request('/api/v1/user/subscription');
  }

  async deleteAccount(password) {
    return this.request('/api/v1/user/account', {
      method: 'DELETE',
      body: JSON.stringify({ password })
    });
  }

  // ==================== Health ====================

  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ==================== Helpers ====================

  arrayBufferToBase64(buffer) {
    if (buffer instanceof ArrayBuffer) {
      buffer = new Uint8Array(buffer);
    }
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export default apiClient;

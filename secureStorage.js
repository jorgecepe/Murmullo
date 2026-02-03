/**
 * Secure Storage Module for Murmullo
 * Uses Electron's safeStorage API to encrypt sensitive data at rest
 */

const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

class SecureStorage {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.cache = new Map();
    this._ensureStorageDir();
  }

  _ensureStorageDir() {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _loadData() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[SecureStorage] Failed to load data:', err.message);
    }
    return {};
  }

  _saveData(data) {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[SecureStorage] Failed to save data:', err.message);
    }
  }

  /**
   * Check if encryption is available on this system
   */
  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Store a sensitive value with encryption
   * @param {string} key - The key to store under
   * @param {string} value - The value to encrypt and store
   * @returns {boolean} - Success status
   */
  setSecure(key, value) {
    try {
      if (!value || typeof value !== 'string') {
        // If value is empty, remove the key
        return this.removeSecure(key);
      }

      const data = this._loadData();

      if (this.isEncryptionAvailable()) {
        // Encrypt the value using OS-level encryption
        const encrypted = safeStorage.encryptString(value);
        data[key] = {
          encrypted: true,
          value: encrypted.toString('base64')
        };
      } else {
        // Fallback: store as base64 (not secure, but better than plaintext)
        console.warn('[SecureStorage] Encryption not available, using base64 fallback');
        data[key] = {
          encrypted: false,
          value: Buffer.from(value).toString('base64')
        };
      }

      this._saveData(data);
      this.cache.set(key, value);
      return true;
    } catch (err) {
      console.error('[SecureStorage] Failed to set secure value:', err.message);
      return false;
    }
  }

  /**
   * Retrieve a decrypted value
   * @param {string} key - The key to retrieve
   * @returns {string|null} - The decrypted value or null
   */
  getSecure(key) {
    try {
      // Check cache first
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }

      const data = this._loadData();
      const item = data[key];

      if (!item) {
        return null;
      }

      let value;
      if (item.encrypted && this.isEncryptionAvailable()) {
        // Decrypt using OS-level encryption
        const buffer = Buffer.from(item.value, 'base64');
        value = safeStorage.decryptString(buffer);
      } else if (!item.encrypted) {
        // Decode base64 fallback
        value = Buffer.from(item.value, 'base64').toString('utf-8');
      } else {
        // Encrypted but encryption not available - cannot decrypt
        console.error('[SecureStorage] Cannot decrypt: encryption not available');
        return null;
      }

      this.cache.set(key, value);
      return value;
    } catch (err) {
      console.error('[SecureStorage] Failed to get secure value:', err.message);
      return null;
    }
  }

  /**
   * Remove a stored value
   * @param {string} key - The key to remove
   * @returns {boolean} - Success status
   */
  removeSecure(key) {
    try {
      const data = this._loadData();
      delete data[key];
      this._saveData(data);
      this.cache.delete(key);
      return true;
    } catch (err) {
      console.error('[SecureStorage] Failed to remove value:', err.message);
      return false;
    }
  }

  /**
   * Check if a key exists
   * @param {string} key - The key to check
   * @returns {boolean} - Whether the key exists
   */
  hasSecure(key) {
    const data = this._loadData();
    return key in data;
  }

  /**
   * Clear cache (for security, call on app quit)
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get a masked version of the key (for UI display)
   * @param {string} key - The key to retrieve
   * @returns {string} - Masked value like "sk-...xyz"
   */
  getMaskedValue(key) {
    const value = this.getSecure(key);
    if (!value || value.length < 10) {
      return value ? '****' : '';
    }
    const prefix = value.substring(0, 7);
    const suffix = value.substring(value.length - 4);
    return `${prefix}...${suffix}`;
  }
}

module.exports = SecureStorage;

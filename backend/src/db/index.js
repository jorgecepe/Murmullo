import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  logger.info('Database connected');
});

pool.on('error', (err) => {
  logger.error('Database error', { error: err.message });
});

/**
 * Database helper functions
 */
export const db = {
  /**
   * Execute a query
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Query executed', { duration: `${duration}ms`, rows: result.rowCount });
      return result;
    } catch (error) {
      logger.error('Query error', { error: error.message, query: text.substring(0, 100) });
      throw error;
    }
  },

  /**
   * Get user by ID
   */
  async getUserById(id) {
    const result = await this.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    const result = await this.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows[0];
  },

  /**
   * Create new user
   */
  async createUser({ email, password_hash, name }) {
    const result = await this.query(
      `INSERT INTO users (email, password_hash, name, plan, is_active, created_at)
       VALUES ($1, $2, $3, 'free', true, NOW())
       RETURNING id, email, name, plan, created_at`,
      [email.toLowerCase(), password_hash, name]
    );
    return result.rows[0];
  },

  /**
   * Update user usage
   */
  async incrementUsage(userId, minutes) {
    await this.query(
      `UPDATE users
       SET usage_minutes_this_month = usage_minutes_this_month + $2,
           total_usage_minutes = total_usage_minutes + $2,
           last_usage_at = NOW()
       WHERE id = $1`,
      [userId, minutes]
    );
  },

  /**
   * Reset monthly usage for all users (run on first of month)
   */
  async resetMonthlyUsage() {
    await this.query(
      `UPDATE users SET usage_minutes_this_month = 0`
    );
    logger.info('Monthly usage reset for all users');
  },

  /**
   * Log transcription
   */
  async logTranscription({ userId, durationSeconds, wordCount, provider }) {
    await this.query(
      `INSERT INTO transcription_logs (user_id, duration_seconds, word_count, provider, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, durationSeconds, wordCount, provider]
    );
  },

  /**
   * Get user stats
   */
  async getUserStats(userId) {
    const result = await this.query(
      `SELECT
         COUNT(*) as total_transcriptions,
         SUM(duration_seconds) as total_duration_seconds,
         SUM(word_count) as total_words
       FROM transcription_logs
       WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  },

  /**
   * Update user plan
   */
  async updateUserPlan(userId, plan) {
    await this.query(
      `UPDATE users SET plan = $2, updated_at = NOW() WHERE id = $1`,
      [userId, plan]
    );
  },

  /**
   * Store refresh token
   */
  async storeRefreshToken(userId, token, expiresAt) {
    await this.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, token, expiresAt]
    );
  },

  /**
   * Validate refresh token
   */
  async validateRefreshToken(token) {
    const result = await this.query(
      `SELECT user_id FROM refresh_tokens
       WHERE token = $1 AND expires_at > NOW() AND revoked_at IS NULL`,
      [token]
    );
    return result.rows[0];
  },

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(token) {
    await this.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1`,
      [token]
    );
  }
};

export default db;

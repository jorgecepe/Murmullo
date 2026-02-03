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

// Initialize database schema
async function initializeSchema() {
  const client = await pool.connect();
  try {
    logger.info('Initializing database schema...');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        plan VARCHAR(50) DEFAULT 'free',
        is_active BOOLEAN DEFAULT true,
        usage_minutes_this_month DECIMAL(10,2) DEFAULT 0,
        total_usage_minutes DECIMAL(10,2) DEFAULT 0,
        last_usage_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Create refresh_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(512) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create transcription_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transcription_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        duration_seconds DECIMAL(10,2),
        word_count INTEGER,
        provider VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transcription_logs_user ON transcription_logs(user_id)`);

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

// Initialize schema on module load
initializeSchema().catch(err => {
  logger.error('Schema initialization failed', { error: err.message });
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

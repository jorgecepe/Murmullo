import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrations = [
  {
    name: '001_create_users_table',
    sql: `
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
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
    `
  },
  {
    name: '002_create_refresh_tokens_table',
    sql: `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    `
  },
  {
    name: '003_create_transcription_logs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS transcription_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        duration_seconds DECIMAL(10,2) NOT NULL,
        word_count INTEGER DEFAULT 0,
        provider VARCHAR(50) DEFAULT 'whisper',
        ai_provider VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_transcription_logs_user ON transcription_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_transcription_logs_created ON transcription_logs(created_at);
    `
  },
  {
    name: '004_create_api_usage_table',
    sql: `
      CREATE TABLE IF NOT EXISTS api_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        status_code INTEGER,
        response_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
    `
  },
  {
    name: '005_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `
  }
];

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('Starting database migrations...\n');

    // First, ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Get already executed migrations
    const { rows: executed } = await client.query('SELECT name FROM migrations');
    const executedNames = new Set(executed.map(r => r.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (executedNames.has(migration.name)) {
        console.log(`✓ ${migration.name} (already executed)`);
        continue;
      }

      console.log(`Running ${migration.name}...`);

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
        await client.query('COMMIT');
        console.log(`✓ ${migration.name} (completed)`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`✗ ${migration.name} (failed):`, error.message);
        throw error;
      }
    }

    console.log('\nAll migrations completed successfully!');

  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

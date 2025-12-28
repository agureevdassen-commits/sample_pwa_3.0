import { Pool } from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

export async function initDatabase() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS samples (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        local_id INTEGER,
        sample VARCHAR(255) NOT NULL,
        well_name VARCHAR(255) NOT NULL,
        block VARCHAR(255) NOT NULL,
        type VARCHAR(255),
        scanned_at TIMESTAMP NOT NULL,
        scanned_by VARCHAR(255),
        is_test BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_samples_device_id ON samples(device_id);
      CREATE INDEX IF NOT EXISTS idx_samples_sample ON samples(sample);
      CREATE INDEX IF NOT EXISTS idx_samples_scanned_at ON samples(scanned_at);
      CREATE INDEX IF NOT EXISTS idx_samples_is_test ON samples(is_test);

      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sync_logs (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255),
        scans_count INTEGER,
        status VARCHAR(50),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

export async function validateApiKey(key) {
  return key === process.env.API_KEY;
}

export function escapeString(str) {
  return String(str || '').trim();
}

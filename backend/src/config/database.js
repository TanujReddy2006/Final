import pg from 'pg';
import { db } from '../data.js';
const { Pool } = pg;
let pool;
let enabled = false;
export async function initDatabase() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://learnforge:learnforge@localhost:5432/learnforge?schema=public';
  try {
    pool = new Pool({ connectionString });
    await pool.query('CREATE TABLE IF NOT EXISTS learnforge_state (id INTEGER PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const result = await pool.query('SELECT payload FROM learnforge_state WHERE id = 1');
    if (result.rows[0]?.payload) {
      const currentCatalogVersion = db.catalogVersion;
      const saved = result.rows[0].payload;
      Object.assign(db, saved);
      if (saved.catalogVersion !== currentCatalogVersion) {
        db.courses = [];
        db.enrollments = [];
        db.assessments = [];
        db.attempts = [];
        db.certificates = [];
        db.notifications = [];
        db.verifications = [];
        db.catalogVersion = currentCatalogVersion;
        await persistDatabase();
      }
    } else await persistDatabase();
    enabled = true;
    console.log('PostgreSQL persistence enabled');
  } catch (error) {
    console.warn(`PostgreSQL unavailable; using in-memory mode: ${error.message}`);
    await pool?.end().catch(() => {});
    pool = undefined;
  }
}
export async function persistDatabase() {
  if (!pool) return;
  await pool.query('INSERT INTO learnforge_state (id, payload, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()', [JSON.stringify(db)]);
}
export const isDatabaseEnabled = () => enabled;

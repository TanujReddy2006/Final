import { createClient } from 'redis';
let client;
export async function initCache() {
  if (!process.env.REDIS_URL) return;
  try { client = createClient({ url: process.env.REDIS_URL }); client.on('error', () => {}); await client.connect(); console.log('Redis verification cache enabled'); } catch { client = undefined; }
}
export async function getCached(key) { if (!client) return null; const value = await client.get(key); return value ? JSON.parse(value) : null; }
export async function setCached(key, value) { if (client) await client.set(key, JSON.stringify(value), { EX: 300 }); }
export async function invalidateCached(key) { if (client) await client.del(key); }

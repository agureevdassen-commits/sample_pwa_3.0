import { getPool, initDatabase, validateApiKey } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = req.headers['x-api-key'];
    const isValid = await validateApiKey(apiKey);
    if (!isValid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await initDatabase();

    const pool = getPool();
    const result = await pool.query('SELECT COUNT(*) AS total FROM samples WHERE is_test = false');
    const totalOnServer = result.rows && result.rows[0] ? Number(result.rows[0].total) : 0;

    res.status(200).json({
      total_on_server: totalOnServer
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
}

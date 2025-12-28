import { getPool, initDatabase, validateApiKey, escapeString } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Валидация API ключа
    const apiKey = req.headers['x-api-key'];
    const isValid = await validateApiKey(apiKey);
    if (!isValid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Валидация данных
    const scans = Array.isArray(req.body) ? req.body : [req.body];
    if (!scans || scans.length === 0) {
      res.status(400).json({ error: 'Expected non-empty array of scans' });
      return;
    }

    // Инициализация БД (создание таблиц если их нет)
    await initDatabase();

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const serverIds = [];

      for (const scan of scans) {
        // Валидация обязательных полей
        const required = ['device_id', 'sample', 'well_name', 'block', 'type', 'scanned_at'];
        for (const field of required) {
          if (!scan[field]) {
            throw new Error(`Missing required field: ${field}`);
          }
        }

        const result = await client.query(
          `INSERT INTO samples (
             device_id, local_id, sample, well_name, block, type,
             scanned_at, scanned_by, is_test, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           RETURNING id`,
          [
            escapeString(scan.device_id),
            scan.local_id || null,
            escapeString(scan.sample),
            escapeString(scan.well_name),
            escapeString(scan.block),
            escapeString(scan.type),
            new Date(scan.scanned_at),
            escapeString(scan.scanned_by) || 'Unknown',
            scan.is_test === true
          ]
        );

        if (result.rows && result.rows[0]) {
          serverIds.push(result.rows[0].id);
        }
      }

      // Логируем синхронизацию
      await client.query(
        `INSERT INTO sync_logs (device_id, scans_count, status, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [scans[0]?.device_id || 'unknown', scans.length, 'success']
      );

      await client.query('COMMIT');

      // Получаем общее количество записей
      const countResult = await client.query('SELECT COUNT(*) AS total FROM samples WHERE is_test = false');
      const totalOnServer = countResult.rows && countResult.rows[0] ? Number(countResult.rows[0].total) : 0;

      res.status(200).json({
        server_ids: serverIds,
        total_on_server: totalOnServer
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction error:', error);

      // Логируем ошибку
      try {
        await client.query(
          `INSERT INTO sync_logs (device_id, scans_count, status, error_message, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          ['unknown', 0, 'error', error.message]
        );
      } catch (e) {
        console.error('Failed to log error:', e);
      }

      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to save scans'
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  res.status(200).json({
    status: 'ok',
    message: 'Sampling API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}

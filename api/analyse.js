// Vercel serverless proxy — eliminates CORS for iOS Safari
// Forwards multipart video uploads to Railway backend

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '500mb',
    externalResolver: true,
  },
};

const RAILWAY_URL = 'https://api.creatorlyai.in';

export default async function handler(req, res) {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Pipe the raw request stream directly to Railway
    // This avoids buffering the entire video in memory
    const railwayRes = await fetch(`${RAILWAY_URL}/api/analyse`, {
      method: 'POST',
      headers: {
        'content-type': req.headers['content-type'],
        'transfer-encoding': 'chunked',
      },
      body: req,
      // @ts-ignore - Node.js fetch supports stream body
      duplex: 'half',
    });

    const contentType = railwayRes.headers.get('content-type') || '';
    const text = await railwayRes.text();

    res.setHeader('content-type', 'application/json');
    res.status(railwayRes.status).send(text);

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy failed: ' + err.message });
  }
}

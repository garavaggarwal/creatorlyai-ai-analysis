// Vercel serverless proxy for chatbot streaming API
// Forwards request body to Railway backend and streams response back

export const config = {
  api: {
    bodyParser: true,
    externalResolver: true,
  },
};

const RAILWAY_URL = 'https://api.creatorlyai.in';

export default async function handler(req, res) {
  // Handle preflight OPTIONS
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
    const railwayRes = await fetch(`${RAILWAY_URL}/api/chatbot`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!railwayRes.ok) {
      const errText = await railwayRes.text();
      return res.status(railwayRes.status).send(errText);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Pipe the response body stream to the client
    const reader = railwayRes.body.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    
    res.end();
  } catch (err) {
    console.error('Chatbot proxy error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chatbot proxy failed: ' + err.message });
    } else {
      res.write('\n[Proxy Error: Stream interrupted]');
      res.end();
    }
  }
}

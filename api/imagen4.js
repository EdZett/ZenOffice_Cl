// Proxy: Google Imagen 4 (bereit wenn Google freigibt)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { prompt, model, aspectRatio, key } = req.body;
  if (!prompt || !key) { res.status(400).json({ error: 'prompt and key required' }); return; }

  const modelName = model || 'imagen-4.0-generate-001';

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectRatio || '1:1',
            safetySetting: 'block_only_high'
          }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: data?.error?.message || 'Imagen 4 Fehler' });
      return;
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt, model, aspectRatio } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const key = process.env.GOOGLE_KEY;
  if (!key) { res.status(500).json({ error: 'GOOGLE_KEY nicht konfiguriert' }); return; }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'imagen-4.0-generate-001'}:predict?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: aspectRatio || '1:1', safetySetting: 'block_only_high' }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) { res.status(r.status).json({ error: data?.error?.message || 'Imagen Fehler' }); return; }
    res.status(200).json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { model, contents, generationConfig } = req.body;
  if (!contents) { res.status(400).json({ error: 'contents required' }); return; }

  const key = process.env.GOOGLE_KEY;
  if (!key) { res.status(500).json({ error: 'GOOGLE_KEY nicht konfiguriert' }); return; }

  try {
    const body = { contents };
    if (generationConfig) body.generationConfig = generationConfig;
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await r.json();
    if (!r.ok) { res.status(r.status).json({ error: data?.error?.message || 'Gemini Fehler' }); return; }
    res.status(200).json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
}

// Gemini Text Proxy – nach gemini.ts getModelName()
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { model, prompt, system, generationConfig } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const key = process.env.GOOGLE_KEY;
  if (!key) { res.status(500).json({ error: 'GOOGLE_KEY nicht konfiguriert' }); return; }

  // Modellnamen exakt wie in getModelName() aus gemini.ts
  const modelMap = {
    'pro':     'gemini-3.1-pro-preview',
    'flash':   'gemini-3-flash-preview',
    'flash25': 'gemini-3.1-flash-lite-preview',
    // Fallback-Aliase
    'gemini-1.5-pro':   'gemini-3-flash-preview',
    'gemini-1.5-flash': 'gemini-3.1-flash-lite-preview',
  };
  const selectedModel = modelMap[model] || model || 'gemini-3-flash-preview';

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (generationConfig) body.generationConfig = generationConfig;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: data?.error?.message || 'Gemini Fehler' });
      return;
    }
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

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

  // Aktuelle Modelle zuerst, danach Ersatz falls ein Name (noch) nicht verfügbar ist
  const flash = ['gemini-3.6-flash', 'gemini-3-flash-preview'];
  const lite  = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  const modelMap = {
    'pro':     ['gemini-3.1-pro-preview', ...flash],
    'flash':   flash,
    'flash25': lite,
    // Alte Namen, die die App noch verwendet
    'gemini-1.5-pro':   flash,
    'gemini-1.5-flash': lite,
  };
  const candidates = modelMap[model] || (model ? [model] : flash);

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (generationConfig) body.generationConfig = generationConfig;

  try {
    let r, data;
    for (const m of candidates) {
      r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      data = await r.json();
      const unknown = r.status === 404 || /not found|not supported|no longer available|deprecated/i.test(data?.error?.message || '');
      if (r.ok || !unknown) break;
      console.warn('Gemini-Modell nicht verfügbar, nehme Ersatz:', m, data?.error?.message);
    }
    if (!r.ok) {
      res.status(r.status).json({ error: data?.error?.message || 'Gemini Fehler' });
      return;
    }
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

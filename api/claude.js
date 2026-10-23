// Claude Proxy – aktuelle Modelle zuerst, bei unbekanntem Modell der bisherige Name als Ersatz
const FALLBACKS = {
  'claude-haiku-5-5':  ['claude-haiku-4-5'],
  'claude-sonnet-5-5': ['claude-sonnet-4-6'],
  'claude-opus-5-5':   ['claude-opus-4-7'],
};
// Die 5.5-Modelle denken immer mit: Aufwand niedrig halten und Platz für das Nachdenken einplanen
const THINKING_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { model, max_tokens, system, messages } = req.body;
  if (!messages) { res.status(400).json({ error: 'messages required' }); return; }

  const key = process.env.CLAUDE_KEY;
  if (!key) { res.status(500).json({ error: 'CLAUDE_KEY nicht konfiguriert' }); return; }

  const candidates = [model, ...(FALLBACKS[model] || [])];
  try {
    let r, data;
    for (const m of candidates) {
      const thinks = THINKING_MODELS.includes(m);
      const body = { model: m, max_tokens: (max_tokens || 2000) + (thinks ? 4000 : 0), messages };
      if (thinks) body.output_config = { effort: 'low' };
      if (system) body.system = system;
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      data = await r.json();
      const unknown = r.status === 404 || data?.error?.type === 'not_found_error' || /model/i.test(data?.error?.message || '') && r.status === 400;
      if (r.ok || !unknown) break;
      console.warn('Claude-Modell nicht verfügbar, nehme Ersatz:', m, data?.error?.message);
    }
    if (!r.ok) { res.status(r.status).json({ error: data?.error?.message || 'Claude Fehler' }); return; }
    res.status(200).json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
}

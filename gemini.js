export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { model, max_tokens, system, messages } = req.body;
  if (!messages) { res.status(400).json({ error: 'messages required' }); return; }

  const key = process.env.CLAUDE_KEY;
  if (!key) { res.status(500).json({ error: 'CLAUDE_KEY nicht konfiguriert' }); return; }

  try {
    const body = { model, max_tokens: max_tokens || 2000, messages };
    if (system) body.system = system;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) { res.status(r.status).json({ error: data?.error?.message || 'Claude Fehler' }); return; }
    res.status(200).json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
}

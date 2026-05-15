export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt, model, image_size, num_inference_steps } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const key = process.env.FAL_KEY;
  if (!key) { res.status(500).json({ error: 'FAL_KEY nicht konfiguriert' }); return; }

  try {
    const r = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size, num_inference_steps, num_images: 1, enable_safety_checker: true })
    });
    const data = await r.json();
    if (!r.ok) { res.status(r.status).json({ error: data?.detail || data?.message || 'fal.ai Fehler' }); return; }
    res.status(200).json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
}

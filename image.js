// Proxy: fal.ai Bildgenerierung
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { prompt, model, image_size, num_inference_steps, key } = req.body;
  if (!prompt || !key) { res.status(400).json({ error: 'prompt and key required' }); return; }

  try {
    const r = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image_size: image_size || { width: 512, height: 512 },
        num_inference_steps: num_inference_steps || 25,
        num_images: 1,
        enable_safety_checker: true
      })
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: data?.detail || data?.message || 'fal.ai Fehler' });
      return;
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Bild-Proxy – nach gemini.ts generateImage() und getVisionModelName()
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt, energy, model: falModel, image_size, num_inference_steps } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const googleKey = process.env.GOOGLE_KEY;
  const falKey = process.env.FAL_KEY;

  // Modellnamen exakt wie in getVisionModelName() aus gemini.ts
  const visionModels = {
    pro:    'gemini-3.1-flash-image-preview',
    flash:  'gemini-2.5-flash-image',
    nano:   'gemini-2.5-flash-image',
  };
  const visionModel = visionModels[energy] || visionModels.flash;

  // Versuch 1: Google Gemini Bildgenerierung
  if (googleKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
            }
          })
        }
      );

      const data = await r.json();

      if (!r.ok) {
        console.warn('Google Bild Fehler:', r.status, data?.error?.message);
      } else {
        // Bilddaten suchen wie in gemini.ts: candidates[0].content.parts.find(p => p.inlineData)
        const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) {
          const b64 = part.inlineData.data;
          res.status(200).json({
            images: [{ url: `data:image/png;base64,${b64}` }]
          });
          return;
        }
        console.warn('Google Bild: kein inlineData in Antwort');
      }
    } catch(e) {
      console.warn('Google Bild Fehler:', e.message);
    }
  }

  // Versuch 2: fal.ai Flux als Fallback
  if (falKey) {
    const falModels = {
      pro:   'fal-ai/flux-pro/v1.1',
      flash: 'fal-ai/flux/dev',
      nano:  'fal-ai/flux/schnell',
    };
    const useFalModel = falModel || falModels[energy] || falModels.nano;
    const steps = energy === 'pro' ? 28 : energy === 'flash' ? 25 : 4;

    try {
      const r = await fetch(`https://fal.run/${useFalModel}`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          image_size: image_size || { width: 512, height: 512 },
          num_inference_steps: num_inference_steps || steps,
          num_images: 1,
          enable_safety_checker: true
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail || data?.error || 'fal.ai Fehler');
      res.status(200).json(data);
      return;
    } catch(e) {
      res.status(500).json({ error: 'fal.ai: ' + e.message });
      return;
    }
  }

  res.status(500).json({ error: 'Kein Bildgenerator verfügbar (GOOGLE_KEY und FAL_KEY fehlen)' });
}

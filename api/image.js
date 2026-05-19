export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt, energy, model: falModel, image_size, num_inference_steps, refImages } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const googleKey = process.env.GOOGLE_KEY;
  const falKey = process.env.FAL_KEY;

  // Google Gemini Bildmodelle – exakt wie in getVisionModelName() aus gemini.ts
  const visionModels = {
    pro:   'gemini-3.1-flash-image-preview',
    flash: 'gemini-2.5-flash-image',
    nano:  'gemini-2.5-flash-image',
  };
  const visionModel = visionModels[energy] || 'gemini-2.5-flash-image';

  // Versuch: Google Gemini Bildgenerierung
  if (googleKey) {
    try {
      // Parts zusammenbauen – Text + optionale Referenzbilder
      const parts = [{ text: prompt }];
      if (refImages && Array.isArray(refImages)) {
        refImages.slice(0, 4).forEach(img => {
          const base64 = img.includes(',') ? img.split(',')[1] : img;
          const mime = img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
          parts.push({ inlineData: { data: base64, mimeType: mime } });
        });
      }

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
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
        const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) {
          res.status(200).json({
            images: [{ url: `data:image/png;base64,${part.inlineData.data}` }]
          });
          return;
        }
        console.warn('Google Bild: kein inlineData');
      }
    } catch(e) {
      console.warn('Google Bild Fehler:', e.message);
    }
  }

  // Fallback: fal.ai Flux
  if (falKey) {
    const falModels = {
      pro:   'fal-ai/flux-pro/v1.1',
      flash: 'fal-ai/flux/dev',
      nano:  'fal-ai/flux/schnell',
    };
    const useFalModel = falModel || falModels[energy] || 'fal-ai/flux/schnell';
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

  res.status(500).json({ error: 'Kein Bildgenerator verfügbar' });
}

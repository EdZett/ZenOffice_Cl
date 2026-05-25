export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt, energy, model: falModel, image_size, num_inference_steps, refImages } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const googleKey = process.env.GOOGLE_KEY;
  const falKey = process.env.FAL_KEY;
  const hasRefImages = refImages && Array.isArray(refImages) && refImages.length > 0;

  // Google Gemini Bildmodelle
  const visionModels = {
    nano:  'gemini-2.5-flash-image',
    flash: 'gemini-3.1-flash-image-preview',
    pro:   'gemini-3-pro-image-preview',
  };

  // fal.ai Flux Modelle
  const falModels = {
    nano:  'fal-ai/flux/schnell',
    flash: 'fal-ai/flux-pro/v1.1',
    pro:   'fal-ai/flux-2-pro',
  };

  const visionModel = visionModels[energy] || visionModels.flash;
  const useFalModel = falModel || falModels[energy] || falModels.nano;

  // Wenn Referenzbilder vorhanden → IMMER Google Gemini nutzen
  // Flux kann keine Referenzbilder verarbeiten
  if (hasRefImages && googleKey) {
    try {
      const parts = [{ text: prompt }];
      refImages.slice(0, 4).forEach(img => {
        const base64 = img.includes(',') ? img.split(',')[1] : img;
        let mime = 'image/jpeg';
        if (img.startsWith('data:image/png')) mime = 'image/png';
        else if (img.startsWith('data:image/webp')) mime = 'image/webp';
        parts.push({ inlineData: { data: base64, mimeType: mime } });
      });

      console.log('Referenzbilder:', refImages.length, '→ Google', visionModel);

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
          })
        }
      );

      const data = await r.json();
      if (!r.ok) {
        console.warn('Google Referenzbild Fehler:', r.status, data?.error?.message);
      } else {
        const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) {
          res.status(200).json({
            images: [{ url: `data:image/png;base64,${part.inlineData.data}` }],
            source: 'google-ref'
          });
          return;
        }
      }
    } catch(e) {
      console.warn('Google Referenzbild Fehler:', e.message);
    }
    // Wenn Google fehlschlägt bei Referenzbildern → Fehler zurückgeben
    res.status(500).json({ 
      error: 'Referenzbilder konnten nicht verarbeitet werden. Bitte Google-Modus verwenden oder Referenzbilder entfernen.' 
    });
    return;
  }

  // Ohne Referenzbilder: gewählter Generator
  // Versuch Google Gemini
  if (googleKey) {
    try {
      const parts = [{ text: prompt }];
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
          })
        }
      );
      const data = await r.json();
      if (r.ok) {
        const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) {
          res.status(200).json({
            images: [{ url: `data:image/png;base64,${part.inlineData.data}` }],
            source: 'google'
          });
          return;
        }
      }
      console.warn('Google Bild Fehler:', data?.error?.message);
    } catch(e) {
      console.warn('Google Bild Fehler:', e.message);
    }
  }

  // Fallback: fal.ai Flux (nur ohne Referenzbilder)
  if (falKey) {
    const steps = energy === 'pro' ? 28 : energy === 'flash' ? 28 : 4;
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
      res.status(200).json({ ...data, source: 'flux' });
      return;
    } catch(e) {
      res.status(500).json({ error: 'fal.ai: ' + e.message });
      return;
    }
  }

  res.status(500).json({ error: 'Kein Bildgenerator verfügbar' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt, energy, model: falModel, image_size, num_inference_steps, refImages, aspect, useGoogle } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const googleKey = process.env.GOOGLE_KEY;
  const falKey = process.env.FAL_KEY;
  const hasRefImages = refImages && Array.isArray(refImages) && refImages.length > 0;
  // Mit Referenzbildern: Modelle ausdrücklich auf das Bild verpflichten, sonst malen sie oft eine neue Szene
  const refPrompt = hasRefImages
    ? 'Use the attached reference image(s) as the base. Keep the people and main subjects from the reference recognizable and unchanged unless the instruction explicitly says otherwise. If the image should be extended, keep the original content and seamlessly add matching scenery around it. Instruction: ' + prompt
    : prompt;

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

  // fal.ai Flux Modelle, die Referenzbilder verstehen
  const falRefModels = {
    nano:  'fal-ai/flux-pro/kontext/multi',
    flash: 'fal-ai/flux-pro/kontext/multi',
    pro:   'fal-ai/flux-2-pro/edit',
  };

  const visionModel = visionModels[energy] || visionModels.flash;
  const validAspects = ['1:1','16:9','9:16','3:2','4:3','2:3','3:4'];
  const aspectRatio = validAspects.includes(aspect) ? aspect : null;

  // Gemini-Bildaufruf: erst mit Seitenverhältnis, bei Ablehnung ohne
  async function callGeminiImage(parts) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent?key=${googleKey}`;
    const make = (withAspect) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(withAspect && aspectRatio ? { imageConfig: { aspectRatio } } : {})
        }
      })
    });
    let r = await fetch(url, make(true));
    let data = await r.json();
    if (!r.ok && aspectRatio && r.status === 400) {
      console.warn('Seitenverhältnis abgelehnt, neuer Versuch ohne:', data?.error?.message);
      r = await fetch(url, make(false));
      data = await r.json();
    }
    return { r, data };
  }
  const useFalModel = falModel || falModels[energy] || falModels.nano;

  // fal.ai-Aufruf: ohne Referenzbilder Text-zu-Bild, mit Referenzbildern Kontext/Edit
  async function callFal() {
    let model, body;
    if (hasRefImages) {
      model = falRefModels[energy] || falRefModels.nano;
      const image_urls = refImages.slice(0, 4);
      // Ein einzelnes Bild: normale Kontext-Variante statt der experimentellen Mehrbild-Version
      if (model.includes('kontext') && image_urls.length === 1) {
        model = 'fal-ai/flux-pro/kontext';
        body = { prompt: refPrompt, image_url: image_urls[0], num_images: 1, ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}) };
      } else body = model.includes('kontext')
        ? { prompt: refPrompt, image_urls, num_images: 1, ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}) }
        : { prompt: refPrompt, image_urls, image_size: image_size || 'auto' };
    } else {
      model = useFalModel;
      const steps = energy === 'pro' ? 28 : energy === 'flash' ? 28 : 4;
      body = {
        prompt,
        image_size: image_size || { width: 512, height: 512 },
        num_inference_steps: num_inference_steps || steps,
        num_images: 1,
        enable_safety_checker: true
      };
    }
    const r = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) {
      const d = data?.detail || data?.error || 'fal.ai Fehler';
      throw new Error(typeof d === 'string' ? d : JSON.stringify(d));
    }
    return { ...data, source: hasRefImages ? 'flux-ref' : 'flux', model };
  }

  // Flux gewählt → wirklich Flux, auch mit Referenzbildern
  if (useGoogle === false && falKey) {
    try {
      res.status(200).json(await callFal());
    } catch(e) {
      res.status(500).json({ error: 'fal.ai: ' + e.message });
    }
    return;
  }

  // Google gewählt mit Referenzbildern → Gemini
  if (hasRefImages && googleKey) {
    try {
      const parts = [{ text: refPrompt }];
      refImages.slice(0, 4).forEach(img => {
        const base64 = img.includes(',') ? img.split(',')[1] : img;
        let mime = 'image/jpeg';
        if (img.startsWith('data:image/png')) mime = 'image/png';
        else if (img.startsWith('data:image/webp')) mime = 'image/webp';
        parts.push({ inlineData: { data: base64, mimeType: mime } });
      });

      console.log('Referenzbilder:', refImages.length, '→ Google', visionModel);

      const { r, data } = await callGeminiImage(parts);
      if (!r.ok) {
        console.warn('Google Referenzbild Fehler:', r.status, data?.error?.message);
      } else {
        const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) {
          res.status(200).json({
            images: [{ url: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}` }],
            source: 'google-ref',
            model: visionModel
          });
          return;
        }
      }
    } catch(e) {
      console.warn('Google Referenzbild Fehler:', e.message);
    }
    // Wenn Google fehlschlägt bei Referenzbildern → Fehler zurückgeben
    res.status(500).json({ 
      error: 'Google konnte die Referenzbilder nicht verarbeiten. Bitte Flux versuchen oder Referenzbilder entfernen.' 
    });
    return;
  }

  // Ohne Referenzbilder: gewählter Generator
  // Versuch Google Gemini
  if (googleKey) {
    try {
      const parts = [{ text: prompt }];
      const { r, data } = await callGeminiImage(parts);
      if (r.ok) {
        const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) {
          res.status(200).json({
            images: [{ url: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}` }],
            source: 'google',
            model: visionModel
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
    try {
      res.status(200).json(await callFal());
      return;
    } catch(e) {
      res.status(500).json({ error: 'fal.ai: ' + e.message });
      return;
    }
  }

  res.status(500).json({ error: 'Kein Bildgenerator verfügbar' });
}

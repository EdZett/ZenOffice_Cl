export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt = '', energy, model: falModel, image_size, num_inference_steps, refImages, aspect, useGoogle, editMode, maskImage } = req.body;
  // Radieren und Erweitern kommen auch ohne eigene Anweisung aus
  if (!prompt && editMode !== 'erase' && editMode !== 'expand') { res.status(400).json({ error: 'prompt required' }); return; }

  const googleKey = process.env.GOOGLE_KEY;
  const falKey = process.env.FAL_KEY;
  const hasRefImages = refImages && Array.isArray(refImages) && refImages.length > 0;
  const hasMask = typeof maskImage === 'string' && maskImage.startsWith('data:');
  // Mit Referenzbildern: Modelle ausdrücklich auf das Bild verpflichten, sonst malen sie oft eine neue Szene
  const editPrompts = {
    edit:   'Edit the attached image. Change ONLY what the instruction asks for. Keep everything else identical: composition, framing, pose, face and identity, clothing, lighting, colors, painting style and background. Do not add other images, insets, borders or text. Instruction: ',
    mask:   'Edit the first attached image only inside the region marked white in the second image (the mask). Leave everything outside the marked region exactly unchanged. Instruction for the marked region: ',
    erase:  'Remove whatever lies in the region marked white in the second image (the mask) from the first image and fill that region naturally with the surrounding background, so no trace remains. Keep everything else exactly unchanged. ',
    expand: 'The first attached image has empty border areas, marked white in the second image (the mask). Fill them by seamlessly continuing the scene with matching style, lighting and perspective. Keep the original central content exactly unchanged. ',
  };
  const refPrompt = !hasRefImages ? prompt
    : editPrompts[editMode] ? editPrompts[editMode] + prompt
    : 'Use the attached reference image(s) as the base. Keep the people and main subjects from the reference recognizable and unchanged unless the instruction explicitly says otherwise. If the image should be extended, keep the original content and seamlessly add matching scenery around it. Instruction: ' + prompt;
  // Für das Flux-Füllmodell: nur beschreiben, was im markierten Bereich entstehen soll
  const fillPrompt = editMode === 'erase' ? 'clean, natural background that seamlessly matches the surroundings' + (prompt ? '. ' + prompt : '')
    : editMode === 'expand' ? 'seamless natural continuation of the scene, same style, lighting and perspective' + (prompt ? '. ' + prompt : '')
    : prompt;

  // Google Gemini Bildmodelle – erster Name ist der aktuelle, danach Ersatz falls (noch) nicht verfügbar
  const visionModels = {
    nano:  ['gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image'],
    flash: ['gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview'],
    pro:   ['gemini-3-pro-image', 'gemini-3-pro-image-preview'],
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

  const visionCandidates = visionModels[energy] || visionModels.flash;
  let visionModel = visionCandidates[0];
  const validAspects = ['1:1','16:9','9:16','3:2','4:3','2:3','3:4'];
  const aspectRatio = validAspects.includes(aspect) ? aspect : null;

  // Gemini-Bildaufruf: unbekannte Modellnamen überspringen und den nächsten Ersatz nehmen
  async function callGeminiImage(parts) {
    let result;
    for (const m of visionCandidates) {
      visionModel = m;
      result = await callGeminiModel(parts);
      const msg = result.data?.error?.message || '';
      const unknown = result.r.status === 404 || /not found|not supported|is not available|no longer available|deprecated/i.test(msg);
      if (result.r.ok || !unknown) return result;
      console.warn('Gemini-Modell nicht verfügbar, nehme Ersatz:', m, msg);
    }
    return result;
  }

  // Ein Modell aufrufen: erst mit Seitenverhältnis, bei Ablehnung ohne
  async function callGeminiModel(parts) {
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
    if (hasRefImages && hasMask) {
      // Echtes Bereichs-Füllen: nur der weiße Teil der Maske wird neu gemalt
      model = 'fal-ai/flux-pro/v1/fill';
      body = { prompt: fillPrompt, image_url: refImages[0], mask_url: maskImage, num_images: 1, output_format: 'png' };
    } else if (hasRefImages) {
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
      if (hasMask) parts.push({ inlineData: { data: maskImage.split(',')[1], mimeType: 'image/png' } });

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

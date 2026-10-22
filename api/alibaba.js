export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt, energy, aspect, refImages } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

  const apiKey = process.env.ALIBABA_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Alibaba-Schlüssel fehlt (ALIBABA_KEY in Vercel eintragen)' }); return; }

  // Arbeitsbereich Frankfurt (DashScope EU-Central)
  const base = process.env.ALIBABA_BASE_URL || 'https://ws-cbf9073m7wec0cdo.eu-central-1.maas.aliyuncs.com/api/v1';
  const hasRefImages = Array.isArray(refImages) && refImages.length > 0;

  // Raster Nano/Flash/Pro – alle Modelle in Frankfurt verfügbar
  const models = {
    nano:  'qwen-image-2.1-turbo',
    flash: 'wan2.6-t2i',
    pro:   'qwen-image-3.0-pro',
  };
  // wan2.6-t2i kennt keine Referenzbilder → bei Flash dann Qwen 3.0
  const refModels = {
    nano:  'qwen-image-2.1-turbo',
    flash: 'qwen-image-3.0',
    pro:   'qwen-image-3.0-pro',
  };
  const model = (hasRefImages ? refModels : models)[energy] || (hasRefImages ? refModels : models).flash;

  // Größe aus dem Seitenverhältnis; Wan braucht mind. 1280×1280 Pixel Fläche, Qwen kommt mit weniger aus
  const [aw, ah] = (/^\d+:\d+$/.test(aspect || '') ? aspect : '1:1').split(':').map(Number);
  const area = model.startsWith('wan') ? 1312 * 1312 : 1024 * 1024;
  const r16 = v => Math.round(v / 16) * 16;
  const size = `${r16(Math.sqrt(area * aw / ah))}*${r16(Math.sqrt(area * ah / aw))}`;

  const text = hasRefImages
    ? 'Use the attached reference image(s) as the base. Keep the people and main subjects from the reference recognizable and unchanged unless the instruction explicitly says otherwise. If the image should be extended, keep the original content and seamlessly add matching scenery around it. Instruction: ' + prompt
    : prompt;
  const maxRefs = model.startsWith('qwen-image-3.0') ? 3 : 4;
  const content = [
    ...(hasRefImages ? refImages.slice(0, maxRefs).map(image => ({ image })) : []),
    { text }
  ];

  // Zentrale Anfrage: dasselbe Format für alle Modelle, nur "model" wechselt
  const body = JSON.stringify({
    model,
    input: { messages: [{ role: 'user', content }] },
    parameters: { size, n: 1, watermark: false, prompt_extend: true }
  });
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const errMsg = d => d?.message || d?.code || 'unbekannter Fehler';
  const imageOf = d => d?.output?.choices?.[0]?.message?.content?.find(c => c.image)?.image;

  try {
    let r = await fetch(`${base}/services/aigc/multimodal-generation/generation`, { method: 'POST', headers, body });
    let data = await r.json();
    let url = r.ok ? imageOf(data) : null;

    // Manche Modelle laufen in Frankfurt nur asynchron: Auftrag anlegen und Ergebnis abholen
    if (!url && /async|synchron/i.test(errMsg(data))) {
      r = await fetch(`${base}/services/aigc/image-generation/generation`, {
        method: 'POST', headers: { ...headers, 'X-DashScope-Async': 'enable' }, body
      });
      data = await r.json();
      const taskId = data?.output?.task_id;
      if (!r.ok || !taskId) throw new Error(errMsg(data));
      for (let i = 0; i < 25 && !url; i++) {
        await new Promise(ok => setTimeout(ok, 2000));
        const t = await fetch(`${base}/tasks/${taskId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        data = await t.json();
        const status = data?.output?.task_status;
        if (status === 'FAILED' || status === 'CANCELED') throw new Error(errMsg(data.output || data));
        if (status === 'SUCCEEDED') url = imageOf(data) || data?.output?.results?.[0]?.url;
      }
      if (!url) throw new Error('Zeitüberschreitung beim Warten auf das Bild');
    }
    if (!url) throw new Error(errMsg(data));

    // Alibaba-Links verfallen nach 24 Stunden → Bild direkt mitliefern, solange es ins Antwortlimit passt
    let out = url;
    try {
      const img = await fetch(url);
      const buf = Buffer.from(await img.arrayBuffer());
      if (img.ok && buf.length < 3_000_000) {
        out = `data:${img.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
      }
    } catch (e) {
      console.warn('Alibaba-Bild nicht eingebettet:', e.message);
    }
    res.status(200).json({ images: [{ url: out }], source: 'alibaba', model });
  } catch (e) {
    res.status(500).json({ error: 'Alibaba (' + model + '): ' + e.message });
  }
}

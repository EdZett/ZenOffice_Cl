export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { prompt = '', energy, aspect, refImages, taskId, model: taskModel, editMode, maskImage } = req.body;

  const apiKey = process.env.ALIBABA_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Alibaba-Schlüssel fehlt (ALIBABA_KEY in Vercel eintragen)' }); return; }

  // Arbeitsbereich Frankfurt (DashScope EU-Central)
  const base = process.env.ALIBABA_BASE_URL || 'https://ws-cbf9073m7wec0cdo.eu-central-1.maas.aliyuncs.com/api/v1';
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const errMsg = d => d?.message || d?.code || 'unbekannter Fehler';
  const imageOf = d => d?.output?.choices?.[0]?.message?.content?.find(c => c.image)?.image || d?.output?.results?.[0]?.url;

  // Alibaba-Links verfallen nach 24 Stunden → Bild direkt mitliefern, solange es ins Antwortlimit passt
  async function sendImage(url, model) {
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
  }

  // Abholen: der Browser fragt mit der Auftragsnummer nach, bis das Bild fertig ist
  if (taskId) {
    try {
      const t = await fetch(`${base}/tasks/${encodeURIComponent(taskId)}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const data = await t.json();
      const status = data?.output?.task_status;
      if (status === 'SUCCEEDED') {
        const url = imageOf(data);
        if (!url) throw new Error('Kein Bild im fertigen Auftrag');
        await sendImage(url, taskModel);
      } else if (!t.ok || ['FAILED', 'CANCELED', 'UNKNOWN'].includes(status)) {
        throw new Error(errMsg(data.output || data));
      } else {
        res.status(200).json({ pending: true, status, taskId, model: taskModel });
      }
    } catch (e) {
      res.status(500).json({ error: 'Alibaba (' + (taskModel || '?') + '): ' + e.message });
    }
    return;
  }

  if (!prompt && editMode !== 'erase' && editMode !== 'expand') { res.status(400).json({ error: 'prompt required' }); return; }
  const hasMask = typeof maskImage === 'string' && maskImage.startsWith('data:');
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

  // Bearbeiten eines vorhandenen Bildes: nur das Verlangte ändern (Maske = zweites Bild, weiß markiert)
  const editPrompts = {
    edit:   'Edit the attached image. Apply the requested change clearly and visibly – the result must look noticeably different in exactly that respect; a nearly identical image is a failure. Everything the change does not concern stays as it is (composition, framing, face and identity, lighting, colors, painting style, background). Do not add other images, insets, borders or text. Requested change: ',
    mask:   'The second attached image is a mask: its white area marks a region of the first image. Apply the requested change clearly and visibly in that region – the result must look noticeably different there; a nearly identical region is a failure. Keep everything outside the marked region unchanged. Requested change: ',
    erase:  'Remove whatever lies in the region marked white in the second image (the mask) from the first image and fill that region naturally with the surrounding background, so no trace remains. Keep everything else exactly unchanged. ',
    expand: 'The first attached image has empty border areas, marked white in the second image (the mask). Fill them by seamlessly continuing the scene with matching style, lighting and perspective. Keep the original central content exactly unchanged. ',
  };
  const text = hasRefImages && editPrompts[editMode] ? editPrompts[editMode] + prompt
    : hasRefImages
    ? 'Use the attached reference image(s) for the identity of the person (face, hair) and for the overall style. Follow the instruction below exactly: wherever it asks for something different from the reference (pose, body shape, clothing, setting, mood …), apply it clearly, even if the result then differs from the reference. Do not simply copy the reference. Instruction: ' + prompt
    : prompt;
  const maxRefs = model.startsWith('qwen-image-3.0') ? 3 : 4;
  const content = [
    ...(hasRefImages ? refImages.slice(0, hasMask ? 1 : maxRefs).map(image => ({ image })) : []),
    ...(hasRefImages && hasMask ? [{ image: maskImage }] : []),
    { text }
  ];

  // Zentrale Anfrage: dasselbe Format für alle Modelle, nur "model" wechselt
  const body = JSON.stringify({
    model,
    input: { messages: [{ role: 'user', content }] },
    parameters: { size, n: 1, watermark: false, prompt_extend: true }
  });

  try {
    // Zuerst als Auftrag anlegen: kein Warten im Server, damit langsame Modelle (Pro) nicht in die Zeitgrenze laufen
    let r = await fetch(`${base}/services/aigc/image-generation/generation`, {
      method: 'POST', headers: { ...headers, 'X-DashScope-Async': 'enable' }, body
    });
    let data = await r.json();
    const newTask = data?.output?.task_id;
    if (r.ok && newTask) {
      res.status(200).json({ pending: true, status: data.output.task_status, taskId: newTask, model });
      return;
    }
    const asyncErr = errMsg(data);
    console.warn('Alibaba-Auftrag nicht möglich, versuche direkt:', asyncErr);

    // Rückfall: direkter Aufruf. Qwen 3.x denkt standardmäßig vor dem Malen nach – das sprengt
    // die 60-Sekunden-Grenze, daher hier ohne Nachdenk-Schritt
    const syncBody = model.startsWith('qwen-image-3.0')
      ? JSON.stringify({ ...JSON.parse(body), parameters: { ...JSON.parse(body).parameters, enable_thinking: false } })
      : body;
    r = await fetch(`${base}/services/aigc/multimodal-generation/generation`, { method: 'POST', headers, body: syncBody });
    data = await r.json();
    const url = r.ok ? imageOf(data) : null;
    if (!url) throw new Error(errMsg(data) + ' (Auftragsweg: ' + asyncErr + ')');
    await sendImage(url, model);
  } catch (e) {
    res.status(500).json({ error: 'Alibaba (' + model + '): ' + e.message });
  }
}

// TTS Proxy – wählbare Stimme, danach Ersatzkette (neueste Google-Modelle zuerst, ElevenLabs vor Neural2)
// Google: PCM-Rohdaten → WAV-Datei · ElevenLabs (fal.ai): MP3-Link
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { text, voice } = req.body;
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const key = process.env.GOOGLE_KEY;
  const falKey = process.env.FAL_KEY;
  if (!key && !falKey) { res.status(500).json({ error: 'GOOGLE_KEY nicht konfiguriert' }); return; }

  // Wählbare Stimmen
  const voices = {
    g31:  { type: 'google', model: 'gemini-3.1-flash-tts-preview', voiceName: 'Kore',    label: 'Google 3.1 · Kore' },
    g38:  { type: 'google', model: 'gemini-3.8-flash-tts',         voiceName: 'Kore',    label: 'Google 3.8 · Kore' },
    g38l: { type: 'google', model: 'gemini-3.8-flash-lite-tts',    voiceName: 'Sulafat', label: 'Google 3.8 Lite · Sulafat' },
    elm:  { type: 'eleven', model: 'fal-ai/elevenlabs/tts/turbo-v2.5', voiceName: 'Brian',   label: 'ElevenLabs · Brian' },
  };
  // Gewählte Stimme zuerst, dann Ersatz in der Reihenfolge der Lieblingsstimmen
  const order = [voice, 'g38l', 'g38', 'g31', 'elm'].filter((v, i, a) => voices[v] && a.indexOf(v) === i);
  const input = text.substring(0, 5000);

  // PCM → WAV (24 kHz, mono, 16 Bit)
  function pcmToWav(pcmBuffer) {
    const sampleRate = 24000, numChannels = 1, bitsPerSample = 16;
    const wav = Buffer.alloc(44 + pcmBuffer.length);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcmBuffer.length, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(numChannels, 22); wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
    wav.writeUInt16LE(numChannels * bitsPerSample / 8, 32); wav.writeUInt16LE(bitsPerSample, 34);
    wav.write('data', 36); wav.writeUInt32LE(pcmBuffer.length, 40); pcmBuffer.copy(wav, 44);
    return wav;
  }
  // Audio-Daten irgendwo in der Antwort finden (generateContent und Interactions liefern unterschiedlich verschachtelt)
  function findAudio(o) {
    if (!o || typeof o !== 'object') return null;
    const mime = o.mimeType || o.mime_type || '';
    const data = o.data || o.audio_data;
    if (typeof data === 'string' && data.length > 100 && (/audio/i.test(mime) || !mime)) return { data, mime };
    for (const v of Object.values(o)) { const f = findAudio(v); if (f) return f; }
    return null;
  }

  async function google(v) {
    if (!key) throw new Error('kein GOOGLE_KEY');
    // Klassischer Weg
    let r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${v.model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voiceName } } } }
      })
    });
    let data = await r.json();
    // Neuere Modelle evtl. nur über die Interactions-Schnittstelle
    if (!r.ok) {
      console.warn(v.model, 'generateContent HTTP', r.status, data?.error?.message);
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          model: v.model,
          input: [{ type: 'user_input', content: [{ type: 'text', text: input }] }],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ voice: v.voiceName }] }
        })
      });
      data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || 'HTTP ' + r.status);
    }
    const audio = findAudio(data);
    if (!audio) throw new Error('kein Audio in Antwort');
    const buf = Buffer.from(audio.data, 'base64');
    const isWav = buf.slice(0, 4).toString() === 'RIFF';
    return { audioContent: (isWav ? buf : pcmToWav(buf)).toString('base64'), mime: 'audio/wav' };
  }

  async function eleven(v) {
    if (!falKey) throw new Error('kein FAL_KEY');
    const r = await fetch(`https://fal.run/${v.model}`, {
      method: 'POST', headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input, voice: v.voiceName, language_code: 'de', stability: 0.5, similarity_boost: 0.75 })
    });
    const data = await r.json();
    if (!r.ok) { const d = data?.detail || data?.error; throw new Error(typeof d === 'string' ? d : JSON.stringify(d) || 'HTTP ' + r.status); }
    if (!data?.audio?.url) throw new Error('kein Audio-Link');
    // Als Link zurückgeben: MP3 längerer Texte passt nicht ins Antwortlimit
    return { audioUrl: data.audio.url, mime: data.audio.content_type || 'audio/mpeg' };
  }

  const errors = [];
  for (const id of order) {
    const v = voices[id];
    try {
      const out = v.type === 'google' ? await google(v) : await eleven(v);
      console.log('TTS Erfolg:', v.label);
      res.status(200).json({ ...out, source: v.model, voice: id, label: v.label, fallback: id !== voice });
      return;
    } catch (e) {
      console.warn(v.label, 'Fehler:', e.message);
      errors.push(v.label + ': ' + e.message);
    }
  }

  res.status(500).json({ error: 'Keine Stimme verfügbar – ' + errors.join(' · ') });
}

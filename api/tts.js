// TTS Proxy – exakt nach gemini.ts generateSpeech()
// Modell: gemini-3.1-flash-tts-preview
// Output: PCM-Rohdaten → WAV-Datei
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { text } = req.body;
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const key = process.env.GOOGLE_KEY;
  if (!key) { res.status(500).json({ error: 'GOOGLE_KEY nicht konfiguriert' }); return; }

  const models = [
    'gemini-3.1-flash-tts-preview',
    'gemini-2.5-flash-tts',
    'gemini-2.5-pro-tts',
  ];

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: text.substring(0, 5000) }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' }
                }
              }
            }
          })
        }
      );

      const data = await r.json();
      
      if (!r.ok) {
        console.warn(model, 'HTTP', r.status, data?.error?.message);
        continue;
      }

      // PCM-Daten aus der Antwort extrahieren – genau wie in gemini.ts
      const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const pcmBase64 = audioPart?.inlineData?.data;
      const mimeType = audioPart?.inlineData?.mimeType || '';

      if (!pcmBase64) {
        console.warn(model, 'kein Audio in Antwort');
        continue;
      }

      console.log('TTS Erfolg:', model, 'mime:', mimeType);

      // PCM → WAV konvertieren (wie audio.ts createWavFile)
      const pcmBuffer = Buffer.from(pcmBase64, 'base64');
      const sampleRate = 24000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * bitsPerSample / 8;
      const blockAlign = numChannels * bitsPerSample / 8;
      const dataSize = pcmBuffer.length;
      const wavBuffer = Buffer.alloc(44 + dataSize);

      // WAV Header schreiben
      wavBuffer.write('RIFF', 0);
      wavBuffer.writeUInt32LE(36 + dataSize, 4);
      wavBuffer.write('WAVE', 8);
      wavBuffer.write('fmt ', 12);
      wavBuffer.writeUInt32LE(16, 16);
      wavBuffer.writeUInt16LE(1, 20);        // PCM
      wavBuffer.writeUInt16LE(numChannels, 22);
      wavBuffer.writeUInt32LE(sampleRate, 24);
      wavBuffer.writeUInt32LE(byteRate, 28);
      wavBuffer.writeUInt16LE(blockAlign, 32);
      wavBuffer.writeUInt16LE(bitsPerSample, 34);
      wavBuffer.write('data', 36);
      wavBuffer.writeUInt32LE(dataSize, 40);
      pcmBuffer.copy(wavBuffer, 44);

      // WAV als Base64 zurückgeben
      res.status(200).json({
        audioContent: wavBuffer.toString('base64'),
        mime: 'audio/wav',
        source: model
      });
      return;

    } catch(e) {
      console.warn(model, 'Fehler:', e.message);
    }
  }

  // Fallback: Google Cloud TTS Neural2-C
  try {
    const r = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: text.substring(0, 5000) },
          voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-C', ssmlGender: 'FEMALE' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.92, pitch: 1.5 }
        })
      }
    );
    const d = await r.json();
    if (d.audioContent) {
      res.status(200).json({ audioContent: d.audioContent, mime: 'audio/mp3', source: 'neural2' });
      return;
    }
  } catch(e) {
    console.warn('Neural2 Fehler:', e.message);
  }

  res.status(500).json({ error: 'Keine TTS-Methode verfügbar' });
}

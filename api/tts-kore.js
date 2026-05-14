// Proxy: Gemini Live Audio – Stimme Kore (natürlich, dunkel, weiblich)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { text, key } = req.body;
  if (!text || !key) { res.status(400).json({ error: 'text and key required' }); return; }

  try {
    // Gemini 2.0 Flash mit nativer Audio-Ausgabe und Kore-Stimme
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text.substring(0, 5000) }] }],
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
      // Fallback: Google Cloud TTS Neural2-C
      const r2 = await fetch(
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
      const d2 = await r2.json();
      if (d2.audioContent) {
        res.status(200).json({ audioContent: d2.audioContent, mime: 'audio/mp3', source: 'neural2' });
        return;
      }
      res.status(r.status).json({ error: data?.error?.message || 'TTS Fehler' });
      return;
    }

    // Kore Audio aus Gemini-Antwort extrahieren
    const part = data.candidates?.[0]?.content?.parts?.[0];
    const b64 = part?.inlineData?.data;
    const mime = part?.inlineData?.mimeType || 'audio/wav';

    if (b64) {
      res.status(200).json({ audioContent: b64, mime, source: 'kore' });
    } else {
      res.status(500).json({ error: 'Kein Audio in der Antwort' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

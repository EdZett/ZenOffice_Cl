// Proxy: Google Cloud TTS → Kore-Stimme
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { text, key, lang } = req.body;
  if (!text || !key) { res.status(400).json({ error: 'text and key required' }); return; }

  // Stimme je nach Sprache wählen
  const langCode = lang || 'de-DE';
  const voiceMap = {
    'de-DE': { name: 'de-DE-Neural2-C', ssmlGender: 'FEMALE' },
    'en-US': { name: 'en-US-Neural2-F', ssmlGender: 'FEMALE' },
    'fr-FR': { name: 'fr-FR-Neural2-C', ssmlGender: 'FEMALE' },
    'es-ES': { name: 'es-ES-Neural2-C', ssmlGender: 'FEMALE' },
    'it-IT': { name: 'it-IT-Neural2-A', ssmlGender: 'FEMALE' },
  };
  const voice = voiceMap[langCode] || voiceMap['de-DE'];

  try {
    const r = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: text.substring(0, 5000) },
          voice: { languageCode: langCode, ...voice },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 0.92,
            pitch: 1.5,
            effectsProfileId: ['headphone-class-device']
          }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: data?.error?.message || 'TTS Fehler' });
      return;
    }
    res.status(200).json({ audioContent: data.audioContent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

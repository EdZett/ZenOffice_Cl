// Premium-Spracherkennung für die Diktier-App: WAV-Aufnahme (16 kHz, mono) → Gemini schreibt wortgetreu mit.
// Ersatzkette: neuestes Flash-Modell zuerst, ältere Namen als Ersatz
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { audio, lang } = req.body || {};
  if (!audio) { res.status(400).json({ error: 'audio required' }); return; }
  const key = process.env.GOOGLE_KEY;
  if (!key) { res.status(500).json({ error: 'GOOGLE_KEY nicht konfiguriert' }); return; }

  const sprache = lang === 'en-US' ? 'Englisch' : 'Deutsch';
  const prompt = `Schreibe wortgetreu mit, was in dieser Aufnahme gesprochen wird (Sprache: ${sprache}). `
    + 'Verwende korrekte Rechtschreibung, Groß- und Kleinschreibung und Zeichensetzung. '
    + 'Nichts zusammenfassen, nichts umformulieren, nichts weglassen, nichts hinzufügen. '
    + 'Gesprochene Satzzeichen-Befehle („Komma“, „Punkt“, „neuer Absatz“) setzt du als Zeichen bzw. Umbruch um. '
    + 'Ist nichts Verständliches gesprochen, antworte mit einer leeren Zeile. Gib NUR den mitgeschriebenen Text zurück.';
  const body = { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/wav', data: audio } }, { text: prompt }] }] };

  try {
    let r, data;
    for (const m of ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash']) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      data = await r.json();
      const unknown = r.status === 404 || /not found|not supported|no longer available|deprecated/i.test(data?.error?.message || '');
      if (r.ok || !unknown) break;
      console.warn('Gemini-Modell nicht verfügbar, nehme Ersatz:', m, data?.error?.message);
    }
    if (!r.ok) { res.status(r.status).json({ error: data?.error?.message || 'Gemini Fehler' }); return; }
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    res.status(200).json({ text });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

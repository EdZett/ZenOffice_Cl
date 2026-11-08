// Premium-Spracherkennung für die Diktier-App: WAV-Aufnahme (16 kHz, mono) → Gemini schreibt wortgetreu mit.
// Ersatzkette: neuestes Flash-Modell zuerst, ältere Namen als Ersatz
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { audio, lang, context, mode, mime } = req.body || {};
  if (!audio) { res.status(400).json({ error: 'audio required' }); return; }
  const key = process.env.GOOGLE_KEY;
  if (!key) { res.status(500).json({ error: 'GOOGLE_KEY nicht konfiguriert' }); return; }

  const sprache = lang === 'en-US' ? 'Englisch' : 'Deutsch';
  const prompt = `Schreibe wortgetreu mit, was in dieser Aufnahme gesprochen wird (Sprache: ${sprache}). `
    + 'Verwende korrekte Rechtschreibung, Groß- und Kleinschreibung und Zeichensetzung. '
    + 'Nichts zusammenfassen, nichts umformulieren, nichts weglassen, nichts hinzufügen. '
    + 'Gesprochene Satzzeichen-Befehle („Komma“, „Punkt“, „neuer Absatz“) setzt du als Zeichen bzw. Umbruch um. '
    + 'Buchstabiert der Sprecher ein Wort (z. B. „G L Ä T T E N“), schreibe das gemeinte Wort einmal aus. '
    + 'Erfinde niemals Wörter oder Sätze: Ist eine Stelle unverständlich, schreibe sie so, wie sie klingt, oder lass sie weg. '
    + 'Ist nichts Verständliches gesprochen, antworte mit einer leeren Zeile. Gib NUR den mitgeschriebenen Text zurück.'
    + (context ? `\n\nZum Zusammenhang – so ging der Text bisher (NICHT wiederholen, nur zum besseren Verstehen):\n${String(context).slice(-600)}` : '');
  // Sprachnachricht/Audiodatei: gemischte Sprachen, Sprecher zuordnen, deutsche Übersetzung dazu
  const filePrompt = 'Dies ist eine Sprachaufnahme (z. B. eine Sprachnachricht). Sie kann mehrere Sprachen gemischt enthalten. '
    + 'Schreibe zuerst unter der Überschrift „Mitschrift“ wortgetreu mit, was gesagt wird – jeweils in der Sprache, in der es gesprochen wurde, mit korrekter Rechtschreibung und Zeichensetzung. '
    + 'Sprechen mehrere Personen, beginne jeden Redebeitrag mit „Person A:“, „Person B:“ usw. (dieselbe Stimme = derselbe Buchstabe); bei nur einer Person keine Kennzeichnung. '
    + 'Schreibe danach unter der Überschrift „Deutsche Übersetzung“ den vollständigen Inhalt auf Deutsch, mit derselben Personen-Kennzeichnung. Ist alles bereits Deutsch, steht dort nur „(Die Aufnahme ist bereits auf Deutsch.)“. '
    + 'Erfinde nichts; Unverständliches als […]. Gib NUR diese zwei Abschnitte zurück, ohne weitere Kommentare.'
    + (context ? `\n\nHinweis: ${String(context).slice(0, 200)}` : '');
  const okMime = ['audio/wav', 'audio/ogg', 'audio/mp3', 'audio/aac', 'audio/flac'].includes(mime) ? mime : 'audio/wav';
  const body = { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mode === 'file' ? okMime : 'audio/wav', data: audio } }, { text: mode === 'file' ? filePrompt : prompt }] }] };
  // Keine niedrige temperature: Gemini 3 rät davon ab (kann sich wiederholen)

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

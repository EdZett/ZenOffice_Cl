# ZenOffice · Übergabedokument für Google AI Studio

Stand: 28.10.2026 · Vorlage: ZenOffice Claude Edition (https://zen-office-cl.vercel.app, GitHub `EdZett/ZenOffice_Cl`)

---

## 0. Auftrag an AI Studio (bitte zuerst lesen)

Baue die hier beschriebene App **ZenOffice** in deiner eigenen Struktur nach (React + TypeScript, Vite). Das Original ist eine einzige `index.html` mit Vanilla-JavaScript plus kleinen Server-Funktionen. Übernimm **das Verhalten, nicht den Code 1:1**.

Wichtige Grundsätze:

1. **Die Oberfläche ist Deutsch**, alle Texte, Hinweise und Fehlermeldungen. Der Nutzer ist kein Techniker: klare Worte, keine Fachbegriffe in der Oberfläche.
2. **Kapitel 6 (Stolperfallen) ist Pflichtlektüre.** Jede dort beschriebene Falle ist im Original wirklich aufgetreten und hat den Nutzer viel Zeit gekostet. Baue die Lösungen von Anfang an ein.
3. **API-Schlüssel nie im Browser-Code.** Alle KI-Aufrufe laufen über eine Server-Schicht (Vercel-Funktionen, Firebase Functions oder Ähnliches). Der Browser kennt nur `/api/...`.
4. **Jedes KI-Modell bekommt eine Ersatzkette.** Erst der neueste Modellname, dann ältere. Antwortet der Dienst mit 404 oder „model not found / not supported / deprecated“, wird automatisch der nächste Name versucht.
5. **Nichts entfernen, was hier beschrieben ist**, auch wenn es klein wirkt. Der Nutzer hat jedes Detail bewusst so gewünscht.
6. Wenn ein Dienst (Claude, fal.ai, Alibaba, ElevenLabs) in deiner Umgebung nicht nutzbar ist, ersetze ihn durch Gemini. **Sage das dem Nutzer ausdrücklich**, statt still etwas anderes zu bauen.

### Zuordnung zur bisherigen AI-Studio-Struktur des Nutzers

Eine ältere Gemini-Fassung der App existiert bereits mit dieser Struktur. Die Funktionen dieses Dokuments gehören dorthin:

| Bereich in diesem Dokument | Datei in AI Studio |
|---|---|
| Kapitel 2 (Text), 3.6 (Diktat), 3.7 (Vorlesen) | `src/components/TextModule.tsx` |
| Kapitel 4 (Vision) | `src/components/AiImageModule.tsx` |
| Kapitel 5 (Tabelle) | eigenes Modul, z. B. `src/components/SheetModule.tsx` |
| Kapitel 1.3 (Modelle, Ersatzketten, Server-Aufrufe) | `src/services/gemini.ts` plus Server-Funktionen |
| Kapitel 1.4 (Speichern, Projekte) | `src/services/firebase.ts`, `types.ts` |
| Hülle, Seitenleiste, Hell/Dunkel | `src/App.tsx` |
| PWA (Kapitel 7) | `public/manifest.json`, Service Worker |

Was die ältere Fassung zusätzlich hat (Teilen über `ShareOverlay.tsx`, Cloud-Synchronisierung mit Firebase, Kostenüberwachung, PDF mit Seitenumbruch), bleibt erhalten. Dieses Dokument ergänzt es, es ersetzt nichts.

---

## 1. Überblick

### 1.1 Was die App ist

Eine KI-gestützte Office-App mit drei Bereichen, umschaltbar über die Seitenleiste:

- **Text**: schreiben, mit KI verbessern, umschreiben, übersetzen, fragen, diktieren, vorlesen
- **Tabelle**: Tabellen per Beschreibung erzeugen und analysieren lassen
- **Vision**: Bilder erzeugen, bearbeiten (Ändern, Maskieren, Radieren, Erweitern), analysieren

Sie läuft im Browser und als installierbare App (PWA) auf PC, Tablet und Handy.

### 1.2 Aussehen

- Dunkles, warmes Design. Farben: Gold `#c9a96e`, Salbei, Rosé, Bordeaux für Aufnahme. Hintergrund fast schwarz, `#111010`.
- Abgerundete Knöpfe und Pillen, Hell/Dunkel umschaltbar (Schalter unten in der Seitenleiste).
- Seitenleiste mit Logo, **KI-Energie** (Nano / Flash / Pro), Bereichen, **Meine Projekte** und Einstellungen.
- Kopfzeile mit Titelfeld (Platzhalter „Textname…“, in Vision „Bildname…“).
- Statusleiste unten: Wörter, Zeichen, gewählte Stufe und gerade sprechende Stimme.
- **Kompakt, besonders auf dem Handy.** Auswahllisten müssen gut lesbar sein: dunkler Hintergrund, der gewählte Eintrag in Gold.

### 1.3 KI-Energie und Modelle

Ein globaler Schalter **Nano / Flash / Pro** wählt für alle Funktionen die Stärke. Die Zuordnung, mit Ersatzkette:

| Zweck | Nano | Flash | Pro |
|---|---|---|---|
| Text (Claude) | claude-haiku-5-5 → claude-haiku-4-5 | claude-sonnet-5-5 → claude-sonnet-4-6 | claude-opus-5-5 → claude-opus-4-7 |
| Bild Gemini | gemini-3.1-flash-lite-image → gemini-2.5-flash-image | gemini-nano-banana-2.1 → gemini-3.1-flash-image → gemini-3.1-flash-image-preview | gemini-3-pro-image → gemini-3-pro-image-preview |
| Bild Flux (fal.ai) | fal-ai/flux/schnell (4 Schritte) | fal-ai/flux/dev (25) | fal-ai/flux-pro/v1.1 (28) |
| Flux mit Referenzbild | fal-ai/flux-pro/kontext (1 Bild) bzw. kontext/multi | dito | fal-ai/flux-2-pro/edit |
| Flux mit Maske | fal-ai/flux-pro/v1/fill | dito | dito |
| Bild Alibaba | qwen-image-2.1-turbo | wan2.6-t2i (mit Referenz: qwen-image-3.0) | qwen-image-3.0-pro |

- **Claude 5.5 denkt immer mit.** Deshalb `output_config: {effort: "low"}` setzen und 4000 Tokens zusätzlich einplanen, sonst werden Antworten abgeschnitten.
- **Gemini-Text** (`gemini-3.6-flash` → `gemini-3-flash-preview`) wird nur für Übersetzen und „Prompt verbessern“ genutzt, jeweils mit Claude als Ersatz.
- **Ersatz für den Fall, dass AI Studio nur Gemini kann:** Text auf `gemini-3.6-flash` (Nano/Flash) bzw. das stärkste verfügbare Gemini-Pro-Modell (Pro). Bild nur Gemini, die Anbieterwahl dann ausblenden.

### 1.4 Speichern

- **Projekte** (Texte und Bilder) erscheinen unter „Meine Projekte“ in der Seitenleiste. Jeder Eintrag hat drei Knöpfe: herunterladen ↓, archivieren und löschen ✕ (mit Rückfrage).
- **Texte werden automatisch gespeichert**, auch nach KI-Änderungen, Übersetzen, Zurück/Vor und dem Einfügen von Bildern. Beim Verlassen oder Ausblenden der Seite wird sofort gespeichert (`visibilitychange`, `pagehide`).
- **Nach einem Neustart erscheint der zuletzt bearbeitete Text wieder.**
- Bilder werden als Blob in IndexedDB gespeichert, nicht in localStorage (zu klein). In Firebase: Bilder in Storage, nicht in Firestore (1-MB-Grenze).
- Gemerkte Einstellungen: Bildprogramm, Stimme, Schriftgröße.

---

## 2. Bereich Text

### 2.1 Werkzeugleiste

**Am PC eine Reihe, auf dem Handy zwei Reihen**, die zusammen seitlich wischen. Reihenfolge:

- **Reihe 1:** Zurück ↶ · Vor ↷ · Kopieren · Löschen · Im/Export (Menü) · **B** · *I* · U · Schriftgröße · Schriftart
- **Reihe 2:** Optimieren (Menü) · Stil (Menü) · Sprache · Vorlesen · Stimmenwahl · Audio herunterladen (erscheint nach dem Vorlesen) · Diktat · Diktatsprache DE/EN

Weitere Regeln:

- Zurück/Vor, Kopieren, Löschen und Im/Export sind **runde Symbolknöpfe**.
- Kopieren und Löschen wirken auf die Markierung, sonst auf alles. „Alles löschen“ fragt nach.
- Zurück/Vor speichert bis zu 6 Schritte, „↩ n Schritte verfügbar“ steht klein unten rechts.
- **Schriftgröße:** Klein 15 px, Normal 19 px, Groß 24 px. Die Wahl wird gemerkt.
- **Schriftart:** Standard, Georgia, Comic.
- **Im/Export (Menü):** Importieren von Bild und Text/Markdown. Exportieren als Text (.txt), als Markdown (.md) und „PDF / Drucken“ (Druckansicht mit Bildern). Dazu „In Projekten speichern“.
- **Sprache:** ein Raster mit über 20 Zielsprachen (Deutsch, Englisch, Französisch, Spanisch, Italienisch, Portugiesisch, Niederländisch, Polnisch, Russisch, Ukrainisch, Tschechisch, Türkisch, Griechisch, Schwedisch …).

**Größen auf Touch-Geräten** (Handy und Tablet, erkannt über `matchMedia('(pointer:coarse)')`, nicht über die Breite):

- Knöpfe mit Text: 37 px hoch, Schrift 14 px.
- Runde Symbolknöpfe: 46 px.
- Die KI-Leiste (2.2) bleibt größer: Eingabefeld etwa 50 px, Knöpfe 44 px.

### 2.2 KI-Leiste „Frage oder Änderung“

Unter der Werkzeugleiste liegt ein Eingabefeld mit **zwei kleinen Symbolknöpfen**. Es gibt keine große Knopfreihe und keine Hinweiszeile.

- **Lupe = Wissen.** Die Frage geht an Claude, die Antwort erscheint in einem **eigenen Fenster**. Der Text bleibt unberührt.
  - Der aktuelle Text geht als optionaler Kontext mit (bis 12 000 Zeichen).
  - Im Fenster gibt es ein Feld **„Folgefrage stellen…“**: Die KI kennt das bisherige Gespräch, der ganze Verlauf wird mitgeschickt.
  - Jede Antwort hat einen eigenen **Kopieren**-Knopf.
  - Ein neues Öffnen beginnt ein neues Gespräch.
- **Stift = Ändern.** Die Anweisung wird direkt im Text umgesetzt, bei Markierung nur dort, sonst am ganzen Text.
  - Bleibt der Text unverändert, erscheint ein Hinweis statt einer falschen Erfolgsmeldung: „Die KI hat den Text nicht verändert – formuliere die Anweisung konkreter oder wähle oben die Stufe Flash/Pro.“
  - Nach dem Ändern erscheint „✓ Text geändert – mit ‚Zurück' rückgängig machen“.
- **Enter im Feld löst nichts aus, auf allen Geräten gleich.** Es kommt nur ein Hinweis, auf dem Handy schließt die Tastatur. Der Nutzer wählt bewusst Lupe oder Stift. `enterkeyhint="done"`.

### 2.3 Optimieren und Stil (Menüs)

Jeder Menüpunkt schickt den Text (oder die Markierung) mit dieser Aufgabe an Claude. Das Ergebnis ersetzt den Text.

| Menü | Punkt | Aufgabe an die KI (wörtlich) |
|---|---|---|
| Optimieren | Grammatik & Klang | Verbessere Grammatik, Klang und Stil. Seriös aber modern und angenehm. Nur der Text. |
| | Zusammenfassen | Fasse diesen Text prägnant zusammen ohne wesentlichen Inhaltsverlust, aber deutlich kürzer. Nur der Text. |
| | Elevator Pitch | Schreibe als kurzen einprägsamen Elevator Pitch. Nur der Text. |
| | Kürzen | Kürze deutlich, behalte alle Kernaussagen. Nur der Text. |
| | → Vision senden | Text wird zu einem englischen Bildprompt und landet im Vision-Anweisungsfeld |
| Stil | Locker | Locker, herzlich, entspannt. Nur der Text. |
| | Formell | Förmlich, professionell, sachlich. Nur der Text. |
| | Schiller | Wie Friedrich Schiller – erhaben, blumig, klassisch-rhetorisch. Nur der Text. |
| | Poetisch | Reichhaltige poetische Bildsprache, orientalisch feierlich und blumig. Nur der Text. |
| | Wissenschaftlich | Präzise und wissenschaftlich. Nur der Text. |
| | Journalistisch | Wie eine professionelle Pressemitteilung. Nur der Text. |

**System-Anweisung für Optimieren/Stil:** „Du bist ein professioneller Textassistent. Gib NUR den fertigen Text zurück – keine Vorbemerkungen, Anführungszeichen oder Erklärungen.“ Dazu kommt der Bild-Hinweis aus 6.5.

**System-Anweisung für Ändern:** „Du bist ein Texteditor. Setze die Anweisung vollständig und erkennbar um – auch wenn dafür Sätze umformuliert, ergänzt, umgestellt oder gestrichen werden müssen. Inhaltliche Wünsche (z. B. ‚mach deutlich, dass …') setzt du sinngemäß im Text um. Was die Anweisung nicht betrifft, bleibt in Stil und Inhalt erhalten. Gib NUR den fertigen Text zurück – keine Vorbemerkungen, keine Anführungszeichen, keine Erklärungen.“ Dazu kommt ebenfalls der Bild-Hinweis.

**System-Anweisung für Wissen:** „Du bist ein hilfreicher, präziser Assistent. Antworte auf Deutsch, klar und gut lesbar, ohne unnötige Einleitung. Bei Folgefragen beziehst du dich auf das bisherige Gespräch.“

### 2.4 Übersetzen („Sprache“)

- Ein Fenster mit einem Raster von Zielsprachen. Ein Klick übersetzt den ganzen Text.
- Anweisung an Gemini: „Übersetze den folgenden Text vollständig und natürlich ins {Sprache}. Gib NUR die fertige Übersetzung zurück, ohne Anmerkungen, Einleitungen oder Erklärungen.“ Dazu temperature 0.1.
- Ersatz ist Claude.
- Bilder bleiben erhalten (6.5).

### 2.5 Bilder im Text

- Bilder kommen auf drei Wegen in den Text: **Importieren**, **vom Desktop hineinziehen** (sie landen an der Ablegestelle) und **Einfügen mit Strg+V**.
- Jedes Bild wird auf höchstens 1600 px verkleinert (JPEG) und ist zunächst **50 % breit**.
- **Ein Bild antippen** öffnet darüber eine kleine Leiste:
  - **S / M / L / Voll** für 25 / 50 / 75 / 100 % Breite
  - **links / mittig / rechts**: Bei links und rechts umfließt der Text das Bild (`float`), mittig steht es allein in der Zeile
  - **✕** entfernt das Bild
- Unten rechts sitzt ein **goldener Ziehpunkt** für die freie Größe in Prozent.
- Der Auswahlrahmen ist ein eigenes Element über dem Text, **keine Klasse am Bild**, damit nichts davon mitgespeichert wird.
- Aus Vision lassen sich Bilder mit **→S / →M / →L** in den Text übernehmen (280 px, 480 px, 100 %).

### 2.6 Diktat

Siehe 3.6. Es ist dieselbe Funktion, mit besonderem Aufbau für Handy und Tablet.

### 2.7 Vorlesen

Siehe 3.7.

---

## 3. Querschnitt-Funktionen

### 3.6 Diktat (Spracheingabe)

Es wird die Spracherkennung des Browsers (`webkitSpeechRecognition`) genutzt, Sprache umschaltbar DE/EN.

- **Am PC:** ein Knopf „Diktat“ am Ende der zweiten Reihe. Beim Aufnehmen **pulsiert er bordeauxrot**. Eine grüne Pille unten zeigt das gerade Gehörte.
- **Auf Handy und Tablet:**
  - Ein **durchsichtiger runder Knopf** (68 px), der **rechts im unteren Drittel schwebt**, damit der Daumen ihn erreicht.
  - Ruhezustand: feiner goldener Ring. Beim Diktat pulsiert er rot, bleibt aber durchsichtig, sodass der Text lesbar bleibt.
  - Er ist immer sichtbar, auch wenn die Leisten weggeglitten sind.
  - **Während des Diktats bleibt die Bildschirmtastatur geschlossen** (`inputmode="none"` am Editor, Fokus entfernen).
  - Tippen auf den Text beendet das Diktat, danach kann man normal korrigieren.
- Weitere Regeln:
  - Der gerade gesprochene Satz erscheint **golden hinterlegt im Text** und wächst live mit. Erst am Ende der Sprechpause wird er **einmal** festgeschrieben.
  - Ein Satzanfang wird großgeschrieben (nach . ! ? : oder am Textanfang).
  - Endet die Erkennung nach einer Pause von selbst, wird sie automatisch neu gestartet, bis der Nutzer stoppt.
- **Unbedingt 6.1 beachten.** Ohne diese Lösung schreibt Android jeden Satz mehrfach.

### 3.7 Vorlesen

- Knopf „Vorlesen“ startet und stoppt. Daneben steht eine Auswahl von **drei Stimmen**, gemerkt in localStorage:
  - **Sulafat** (Standard, Lieblingsstimme): Google `gemini-3.8-flash-lite-tts`, Stimme „Sulafat“
  - **Kore**: Google `gemini-3.8-flash-tts`, Stimme „Kore“
  - **Joy**: ElevenLabs über fal.ai `fal-ai/elevenlabs/tts/turbo-v2.5`, Voice-ID `DsY1TMHF6R6uylNq96bs`, language_code „de“, stability 0.5, similarity_boost 0.75
- **Ersatzkette:** gewählte Stimme → Sulafat → Kore → Kore 3.1 (`gemini-3.1-flash-tts-preview`, nur stiller Ersatz) → Joy. Die Browserstimme kommt nur als allerletzter Notbehelf. Die Statusleiste zeigt, welche Stimme wirklich spricht, und „(Ersatz)“, wenn eingesprungen wurde.
- **Ist Text markiert, wird nur die Markierung vorgelesen.** Dazu erscheint der Hinweis „Lese die Markierung vor“. Höchstens 4800 Zeichen.
- Google liefert rohe PCM-Daten (24 kHz, mono, 16 Bit). Der Server setzt einen WAV-Kopf davor. Neue Modelle laufen eventuell nur über die Interactions-Schnittstelle; ist `generateContent` erfolglos, wird diese als Zweites versucht.
- ElevenLabs liefert einen MP3-Link. Er wird als Link zurückgegeben, nicht eingebettet (Größengrenze).
- **Audio herunterladen** ohne die App zu verlassen: per `fetch` als Blob holen und über einen unsichtbaren Download-Link speichern. Niemals einfach den Link öffnen, sonst landet man in einem Player außerhalb der App.

### 3.8 Leisten auf Handy und Tablet (nur Touch, nie am PC)

- Werkzeugleiste und KI-Leiste liegen in einem gemeinsamen Behälter.
- **Sobald man im Text tippt oder diktiert, gleiten beide sanft nach oben weg** (negatives `margin-top`, Übergang 0,28 s). So gehört der Bildschirm dem Text.
- **Ein kurzer Wisch nach unten (mehr als 40 px) auf dem Text holt sie vollständig zurück.** Weiterschreiben lässt sie wieder weggleiten.
- **Scrollen allein schaltet nichts um** (siehe 6.2).
- Wechselt das Gerät auf Maus (`pointer:coarse` wird false), kommt die Leiste sofort zurück und bleibt.

---

## 4. Bereich Vision (Bilder)

### 4.1 Bedienfeld

- **Bildprogramm:** Gemini · Flux · Alibaba (gemerkt).
- **Qualitätsstufe:** Nano · Flash · Pro (gleich der globalen KI-Energie).
- **Anweisungsfeld** „Beschreibe, was entstehen soll…“.
- Checkbox „Hochgeladene Bilder als Stil-/Personenreferenz mitgeben“.
- Knopfreihe:
  - Eingabe leeren
  - Prompt verbessern (Zauberstab)
  - Referenzbild hinzufügen
  - **Zurück / Vor** für Karten
  - großer Knopf **ERSTELLEN**
- **Seitenverhältnis:** 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9.

### 4.2 Erzeugen

- **Jeder Klick auf Erstellen legt sofort eine eigene Karte an.** Mehrere Bilder dürfen parallel entstehen. Die Stufe wird beim Klick gemerkt, nicht beim Ende.
- Jede Karte zeigt:
  - das Bild im **echten Seitenverhältnis** (`object-fit: contain`, nichts abschneiden)
  - ein Abzeichen „Programm · Stufe · Modell“
  - den Prompt
  - die Knöpfe Bearbeiten, Analyse, Speichern & Download, →S, →M, →L
- **Referenzbilder ohne Bearbeiten:** Sie dienen nur der Identität (Gesicht, Haare) und dem Stil, die Wünsche des Nutzers haben Vorrang. Anweisung: „Use the attached reference image(s) for the identity of the person (face, hair) and for the overall style. Follow the instruction below exactly: wherever it asks for something different from the reference (pose, body shape, clothing, setting, mood …), apply it clearly, even if the result then differs from the reference. Do not simply copy the reference. Instruction: …“
- **Prompt verbessern:** Gemini, Ersatz Claude. „Behalte ausnahmslos ALLE Details, Stilvorgaben und Wünsche des Nutzers bei … lasse nichts weg.“ Ist ein Referenzbild dabei, beginnt der Prompt mit „Using the attached reference image, …“.
- **Bilder hineinziehen:**
  - auf die Bildfläche → eigene Karte „Eigenes Bild“ mit Bearbeiten und Analyse
  - auf das Bedienfeld → Referenzbild
  - anderswo abgelegte Dateien abfangen, damit der Browser das Bild nicht selbst öffnet und die App verlässt

### 4.3 Bearbeiten (Werkzeugfenster)

Der Knopf **Bearbeiten** auf einer Karte öffnet ein Fenster mit vier Modi:

| Modus | Bedienung | Was passiert |
|---|---|---|
| Ändern | Wunsch eintippen | ganzes Bild gemäß Wunsch ändern |
| Maskieren | Bereich mit Pinsel weiß übermalen und Wunsch eintippen | nur der Bereich wird geändert |
| Magic Eraser | Objekt übermalen | Objekt entfernen, Hintergrund natürlich auffüllen |
| Erweitern | 16:9, 4:3, 1:1, 3:4, 9:16 oder rundum | Bild wird an den Rändern fortgesetzt |

- **Grundlage ist immer das Bild der angeklickten Karte**, nicht das Referenzbild. Es geht als einzige Referenz mit.
- **Das Ergebnis wird eine neue Karte direkt über dem Ausgangsbild**, damit man vergleichen kann. Das Original bleibt.
- Pinsel mit Zurück/Vor, bis zu 30 Schritte.
- Die Maske hat die gleiche Größe wie das Bild, weiß bedeutet „ändern“.
- **Pixelgenaues Verschmelzen:** Außerhalb der Maske wird das Ergebnis mit dem Original überblendet, mit weichem Rand. Beim Erweitern geschieht das immer, sonst per Checkbox.
- **Vorher übersetzt Claude Haiku den deutschen Wunsch in eine konkrete englische Anweisung.** Sie erscheint auf der Karte mit „→“. System-Anweisung: „You turn a user's image-editing request (usually German) into one precise English instruction for an AI image model. Make the requested change concrete and clearly visible, e.g. ‚noticeably slimmer, more feminine arms: slender upper arms and forearms, narrow wrists, soft contours'. Describe only the change, not the rest of the image. Reply with the instruction only.“
- **Anweisungen an die Bildmodelle** (wörtlich übernehmen, siehe 6.6):
  - **edit:** „Edit the attached image. Apply the requested change clearly and visibly – the result must look noticeably different in exactly that respect; a nearly identical image is a failure. Everything the change does not concern stays as it is (composition, framing, face and identity, lighting, colors, painting style, background). Do not add other images, insets, borders or text. Requested change: …“
  - **mask:** „The second attached image is a mask: its white area marks a region of the first image. Apply the requested change clearly and visibly in that region – the result must look noticeably different there; a nearly identical region is a failure. Keep everything outside the marked region unchanged. Requested change: …“
  - **erase:** „Remove whatever lies in the region marked white in the second image (the mask) from the first image and fill that region naturally with the surrounding background, so no trace remains. Keep everything else exactly unchanged.“
  - **expand:** „The first attached image has empty border areas, marked white in the second image (the mask). Fill them by seamlessly continuing the scene with matching style, lighting and perspective. Keep the original central content exactly unchanged.“
- Wie die Programme die Maske bekommen:
  - **Flux** nutzt bei Maske das echte Füllmodell `flux-pro/v1/fill` (Bild + Maske getrennt).
  - **Gemini und Alibaba** bekommen die Maske als zweites Bild.

### 4.4 Analyse

- Das **Bild selbst** wird verkleinert (1568 px, JPEG, Base64) an Claude geschickt, nicht nur der alte Prompt.
- Die Anweisung verlangt eine gründliche deutsche Analyse in fünf Abschnitten mit Zwischenüberschriften:
  1. Komposition und Pose
  2. Licht und Schatten
  3. Farbpalette und Materialität
  4. Personen und Details
  5. Wirkung und Deutung
- Danach folgt eine Zeile „PROMPT:“ mit einem englischen Prompt für ein sehr ähnliches Bild.
- Die Antwort erscheint im Antwortfenster (ohne Folgefragen). Der Knopf **„Prompt übernehmen“** setzt den Prompt ins Anweisungsfeld.
- Markdown-Sternchen werden entfernt, dabei aber keine Leerzeichen.

### 4.5 Alibaba (falls nutzbar)

- Arbeitsbereich Frankfurt (DashScope, eu-central-1). Die Modelle müssen dort unter „Model Invocation“ freigeschaltet sein.
- **Ablauf:** Der Server legt einen asynchronen Auftrag an (`X-DashScope-Async: enable`) und gibt die Auftragsnummer zurück. Der Browser fragt alle 3 s nach, bis zu 5 Minuten. Lehnt Alibaba den Auftragsweg ab, wird direkt aufgerufen, bei Qwen 3.x mit `enable_thinking: false`. Sonst bricht Pro an der 60-Sekunden-Grenze ab (504).
- Fertige Bilder werden als Data-URI eingebettet, weil Alibaba-Links nach 24 h verfallen.
- Größe aus dem Seitenverhältnis: Wan braucht mindestens 1312×1312 px Fläche, Qwen 1024×1024. Kanten auf Vielfache von 16 runden.
- Der Inhaltsfilter („Green net check“) ist sehr streng. Wörter wie „Brust“ oder „intim“ führen zur Ablehnung. Dann einen verständlichen Hinweis zeigen: umformulieren oder Flux/Gemini nehmen.

---

## 5. Bereich Tabelle

- Eingabefeld „Z. B.: Quartals-Umsatz 5 Produkte Q1–Q4…“ und die Knöpfe **Erstellen**, **Analysieren** und **Leeren**.
- **Erstellen:** Anweisung an Claude „Erstelle eine vollständige HTML-Tabelle mit realen sinnvollen Daten. Gib NUR \<table\>…\</table\> HTML zurück, kein Markdown, keine Erklärungen.“ Codeblock-Markierungen entfernen.
- **Analysieren:** „Analysiere diese Tabelle auf Deutsch“ mit der System-Anweisung „Kurze prägnante Datenanalyse.“ Das Ergebnis erscheint als Kasten unter der Tabelle.

---

## 6. Stolperfallen und ihre Lösungen (Pflicht)

### 6.1 Diktat auf Android schreibt Wörter mehrfach

- **Ursache:** Chrome auf Android liefert im Dauer-Modus (`continuous: true`) denselben Satz mehrfach und wachsend, also „Hallo“, „Hallo wie“, „Hallo wie geht's“. Die Fassungen sind oft alle als „final“ markiert, und `resultIndex` verhält sich anders als am PC. Wer jedes finale Ergebnis anhängt, bekommt lange Texte voller Wiederholungen. **Daran ist ein früherer Gemini-Versuch des Nutzers gescheitert.**
- **Lösung:**
  1. Pro Erkennungs-Sitzung einen Platzhalter (`<span>`) an der Schreibstelle einfügen.
  2. Bei jedem `onresult` den **gesamten** Sitzungstext aus **allen** Ergebnissen neu bilden und den Platzhalter damit ersetzen, nicht anhängen. Dabei werden wiederholte Fassungen zusammengeführt: Beginnt eine Fassung (klein geschrieben, ohne Satzzeichen) mit der vorigen, ersetzt sie diese. Ist sie ein Anfangsstück der vorigen, wird sie übersprungen. Sonst wird sie angehängt.
  3. Bei `onend` den Platzhalter durch reinen Text ersetzen und die Erkennung neu starten.
  4. Beim Stoppen ebenso festschreiben und **`onresult` abmelden**, sonst erzeugen verspätete Ergebnisse Doppelungen.

### 6.2 Flimmern der Werkzeugleiste auf dem Handy

- **Ursache:** Die Leiste wurde abhängig von der Scrollrichtung ein- und ausgeblendet. Beim Tippen oder Diktieren verschiebt sich der Text von selbst, das Ausblenden lässt ihn springen, das Springen gilt als „zurückscrollen“ und blendet ein, und so weiter, viele Male pro Sekunde.
- **Lösung:** Nie über Scroll-Ereignisse schalten. Ausblenden nur durch echte Eingabe (`input` im Editor), Einblenden nur durch einen Fingerwisch (`touchstart`/`touchmove`, mehr als 40 px nach unten).
- **Zusätzlich:** Größe und Position der Seite nur dann an die Tastatur anpassen (`visualViewport`), wenn sie die Seite wirklich verdeckt, und höchstens einmal pro Bild (`requestAnimationFrame`). Im Viewport-Meta `interactive-widget=resizes-content` setzen. Knöpfe nur Farben animieren lassen, nicht `all`.

### 6.3 Fehler 413 (Anfrage zu groß)

- **Ursache:** Vercel-Funktionen nehmen höchstens etwa 4,5 MB pro Anfrage an. Handyfotos als Base64 sprengen das.
- **Lösung:** Jedes Bild **vor** dem Senden auf höchstens 1536 px verkleinern (Canvas, JPEG 0,92). Das gilt für Referenzbilder, Bearbeitungsbilder und die Analyse.

### 6.4 Eingefügter Text aus Google Keep zerstört die Seite

- **Ursache:** Beim Kopieren aus Keep (und anderen Web-Apps) kommt HTML mit fester Position, Rollbereich, dunklen Flächen und Overlays mit. Ein bearbeitbares Feld übernimmt das ungeprüft. Danach waren zwei Drittel der Seite abgedunkelt, und nichts war mehr bedienbar.
- **Lösung:** Beim Einfügen (`paste`) das HTML säubern:
  - nur einfache Tags behalten: b, i, u, p, div, br, ul, ol, li, h1–h4, a, img, table
  - **alle Attribute, Stile und Klassen entfernen**
  - Fett, Kursiv und Unterstrichen, die nur als Stil angegeben sind, in echte b/i/u umwandeln
  - script, style, svg, button und Ähnliches komplett löschen
- **Auch gespeicherte Texte beim Laden** durch dieselbe Säuberung schicken, damit kaputte Texte heilen.

### 6.5 Bilder verschwinden bei KI-Textänderungen

- **Ursache:** Optimieren, Stil, Übersetzen und Ändern schicken nur reinen Text an die KI und ersetzen danach alles. Die Bilder gehen verloren.
- **Lösung:**
  1. Jedes Bild vorher durch einen Platzhalter `[[BILD1]]`, `[[BILD2]]` … ersetzen.
  2. Der KI sagen: „Platzhalter wie [[BILD1]] stehen für Bilder: Übernimm sie unverändert und lass sie an der inhaltlich passenden Stelle stehen.“
  3. Danach die echten Bilder (mit Größe und Ausrichtung) an den Platzhaltern wieder einsetzen. Fehlende Bilder ans Textende setzen und einen kurzen Hinweis zeigen.

### 6.6 Bildbearbeitung liefert fast identische Bilder

- **Ursache:** Vorsichtige Anweisungen wie „change only minimally“ führen dazu, dass die Modelle praktisch nichts ändern.
- **Lösung:** Die Anweisungen aus 4.3 verlangen ausdrücklich eine **klar sichtbare** Änderung („a nearly identical image is a failure“). Dazu formuliert Claude Haiku den Wunsch vorher konkret auf Englisch.

### 6.7 Flux wurde gewählt, aber Google hat gemalt

- **Ursache:** Der Server versuchte immer zuerst Google.
- **Lösung:** Die Anbieterwahl des Nutzers ausdrücklich mitschicken (z. B. `useGoogle: false`) und dann **wirklich** nur diesen Anbieter nehmen.

### 6.8 Audio-Download verlässt die App

- Ein Download-Link auf eine fremde Adresse (fal-CDN) öffnet einen Player, und der Text ist weg.
- **Lösung:** siehe 3.7, Blob holen und lokal speichern.

### 6.9 Text ging verloren

- **Ursache:** Das automatische Speichern lief nur beim Tippen, nicht nach KI-Änderungen.
- **Lösung:** Nach **jeder** Änderung speichern (KI, Übersetzen, Zurück/Vor, Bild einfügen), beim Ausblenden der Seite sofort speichern und den letzten Text beim Start wiederherstellen.

### 6.10 Kleinigkeiten mit großer Wirkung

- **Handy-Erkennung immer über `pointer:coarse`, nicht über die Bildschirmbreite.** Tablets sind breit, aber trotzdem Touch.
- **Auswahllisten:** `color-scheme: dark` setzen und `option` eigens einfärben, sonst steht weiße Schrift auf weißem Grund.
- **Windows-Desktopsymbol:** Windows merkt sich Symbole nach Dateinamen. Bei einem neuen Symbol einen neuen Dateinamen verwenden.
- **Android-Symbol:** eine eigene „maskable“-Fassung ohne Rand, das Motiv innerhalb der inneren 80 %. Sonst füllt Android den runden Rahmen weiß auf.
- **Service Worker:** `/api/*` nie zwischenspeichern.

---

## 7. PWA (installierbare App)

- `manifest.json`: Name „ZenOffice Claude Edition“, Kurzname „ZenOffice“, `display: standalone`, Hintergrund und Theme `#111010`, Sprache „de“.
- Symbole: buntes Symbol (Frau mit Feder) in 192 und 512 px, `purpose: any`, dazu randlose `maskable`-Fassungen.
- **Das Browser-Tab-Symbol bleibt bewusst das alte, dezente Sepia-Logo**, ebenso das Logo in der App.
- Service Worker mit Cache-Namen, den man bei jedem Update hochzählt.

---

## 8. Server-Schicht (was gebraucht wird)

| Endpunkt | Aufgabe | Schlüssel |
|---|---|---|
| `/api/claude` | Claude Messages API, Ersatzkette, effort low bei 5.5 | CLAUDE_KEY |
| `/api/gemini` | Gemini-Text (Übersetzen, Prompt verbessern), Ersatzkette | GOOGLE_KEY |
| `/api/image` | Gemini-Bild und Flux: Erzeugen, Referenzen, Bearbeiten, Maske | GOOGLE_KEY, FAL_KEY |
| `/api/alibaba` | Qwen/Wan: Auftrag anlegen, Abholen per Auftragsnummer | ALIBABA_KEY |
| `/api/tts` | Vorlesen: Gemini-TTS und ElevenLabs über fal, Ersatzkette | GOOGLE_KEY, FAL_KEY |

- Alle Endpunkte erlauben CORS und `OPTIONS`.
- Fehlermeldungen kommen als `{error: "…"}` und auf Deutsch zurück.
- Zeitgrenze 60 s, deshalb ist der Alibaba-Auftragsweg nötig.

---

## 9. Abnahme-Liste (zum Schluss prüfen)

- [ ] Text aus Google Keep einfügen: Es kommt sauberer Text an, und die Seite bleibt bedienbar.
- [ ] Auf dem Android-Handy einen langen Text diktieren: keine Wiederholungen, keine Tastatur, der schwebende Mikrofonknopf ist erreichbar.
- [ ] Auf dem Handy schreiben: Die Leisten gleiten weg, ein Wisch nach unten holt sie zurück, nichts flimmert.
- [ ] Text mit zwei Bildern optimieren und übersetzen: Beide Bilder stehen danach an derselben Stelle.
- [ ] Bild in den Text ziehen, verkleinern und links setzen: Der Text umfließt es.
- [ ] Teil des Textes markieren und vorlesen: Nur der markierte Teil wird gesprochen.
- [ ] Großes Handyfoto als Referenz nutzen: kein Fehler 413.
- [ ] Bild bearbeiten (Ändern, Maske, Radieren, Erweitern): Es entsteht eine neue Karte über dem Original, und die Änderung ist sichtbar.
- [ ] Flux wählen und erzeugen: Das Abzeichen zeigt Flux, nicht Google.
- [ ] Am PC: Die Werkzeugleiste gleitet nie weg.
- [ ] App schließen und wieder öffnen: Der letzte Text, die Schriftgröße und die Stimme sind wieder da.

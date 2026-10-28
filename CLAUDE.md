# ZenOffice · Claude Edition

Arbeitssprache mit dem Nutzer ist **Deutsch**. Stand dieser Beschreibung: 2026-10-24.

## 1. Projekt-Übersicht & Ziel

ZenOffice Claude Edition ist eine KI-gestützte Office-App mit drei Bereichen: **Text**, **Tabelle** und **Vision** (Bilder). Sie soll ansprechend und übersichtlich sein und trotzdem viel können. Sie läuft im Browser und als installierbare App (PWA) auf PC und Handy.

- **Live:** https://zen-office-cl.vercel.app (Vercel-Projekt `zen-office-cl`, Team `alberts-s-projects`)
- **Repository:** `EdZett/ZenOffice_Cl` (öffentlich), Hauptzweig `main`
- **Lokal:** `C:\Users\Albert\antigravity\ZenOffice_Cl`
- **Tech-Stack:** eine einzige `index.html` (HTML, CSS und Vanilla-JS, ohne Build-Schritt und ohne Framework) plus Vercel-Serverless-Funktionen in `api/` (Node, `export default handler`). Es gibt keine `package.json` und keine Abhängigkeiten.
- **Schlüssel** liegen nur als Vercel-Umgebungsvariablen vor und sind nie im Code: `CLAUDE_KEY`, `GOOGLE_KEY`, `FAL_KEY`, `ALIBABA_KEY` (optional `ALIBABA_BASE_URL`).
- **Schwesterprojekte** (nicht verwechseln): ZenOffice-Gold, ZenOffice_Studio, ZenOffice_Lab sowie die Gemini-Version unter `C:\Users\Albert\antigravity\ZenOffice` (React/TS). Die Gemini-Version diente als Vorbild für Maskieren, Magic Eraser und Erweitern (`src/components/AiImageModule.tsx`).

**Aktueller Stand:** Alles Folgende ist veröffentlicht und läuft:

- Text: Optimieren, Stil, Übersetzen, Wissen/Ändern-Leiste, Diktat und Vorlesen mit Stimmenwahl
- Tabelle
- Vision mit drei Bildprogrammen (Gemini, Flux, Alibaba) in je drei Stufen
- Bildanalyse, Bearbeitungswerkzeuge sowie Zurück/Vor
- Neues Desktop-Symbol

## 2. Architektur & Module

```
index.html          ganze App (~2100 Zeilen): CSS oben, HTML, dann <script>
api/claude.js       Claude-Proxy (Messages API), Modell-Ersatzkette, effort "low" für 5.5-Modelle
api/gemini.js       Gemini-Text (Übersetzen, Zauberstab), Ersatzkette
api/image.js        Gemini- und Flux-Bilder: Erzeugen, Referenzbilder, Bearbeiten, Maske/Füllen
api/alibaba.js      Alibaba Qwen/Wan (Frankfurt): Auftrag anlegen, dann Abholen im Browser
api/tts.js          Vorlesen: Gemini-TTS-Stimmen und ElevenLabs über fal.ai, Ersatzkette
api/imagen4.js      Google Imagen 4 (nicht in der Oberfläche erreichbar)
manifest.json       PWA-Manifest (Symbole ?v=2, purpose "any")
sw.js               Service Worker, Cache "zenoffice-claude-v4", /api/* nie gecacht; App-Seite „erst Netz, dann Speicher“ (früher umgekehrt → nach Updates zuerst alte Version); neuer SW lädt die Seite einmal neu
vercel.json         Header; maxDuration 60 s für api/alibaba.js
icon-192/512, apple-touch-icon, icon-180   buntes Symbol (Frau mit Feder) für Desktop und Startbildschirm
icon-maskable-192/512                      randlose Handy-Fassung (purpose "maskable"): ohne Silberrahmen, dunkelbrauner Rand, Motiv in der 80-%-Sicherheitszone – sonst füllt Android den runden Rahmen weiß auf
favicon.ico, icon-32, icon.png             altes dezentes Sepia-Symbol (Browser-Tab), absichtlich so
```

**Zuordnung „KI-Energie“ (Nano / Flash / Pro), global in `energy`:**

| | Nano | Flash | Pro |
|---|---|---|---|
| Claude-Text (`CLAUDE`) | claude-haiku-5-5 | claude-sonnet-5-5 | claude-opus-5-5 |
| Gemini-Bild (`api/image.js`) | gemini-3.1-flash-lite-image | gemini-nano-banana-2.1 | gemini-3-pro-image |
| Flux (`FAL`) | fal-ai/flux/schnell | fal-ai/flux/dev | fal-ai/flux-pro/v1.1 |
| Flux mit Referenz | fal-ai/flux-pro/kontext (1 Bild) bzw. /multi | dito | fal-ai/flux-2-pro/edit |
| Alibaba | qwen-image-2.1-turbo | wan2.6-t2i (mit Referenz: qwen-image-3.0) | qwen-image-3.0-pro |

Jedes Modell hat einen älteren Namen als Ersatz. Ist ein neuer Name unbekannt (404 oder „not found“), springt der Ersatz ein.

**Weitere Zuständigkeiten:**

- Gemini-Text: `gemini-3.6-flash`, Ersatz `gemini-3-flash-preview`. Wird nur für Übersetzen und den Zauberstab in Vision genutzt, jeweils mit Claude als Ersatz.
- Vorlesen (`ttsVoice`, localStorage `zo_voice`), Auswahl im Feld neben „Vorlesen“:
  - `g38l` Sulafat 3.8 Lite: **Standard**, Lieblingsstimme des Nutzers
  - `g38` Kore 3.8
  - `elj` ElevenLabs Joy, deutsche Fassung aus der Stimmenbibliothek, per Voice-ID `DsY1TMHF6R6uylNq96bs` über fal `elevenlabs/tts/turbo-v2.5`. Ersetzt seit 2026-10-27 Brian (`elm`); Everett (`ele`) wurde auf Wunsch wieder entfernt. Gespeicherte alte Wahl wird zu Joy. Der Nutzer will zwei Frauenstimmen und eine Männerstimme.
  - Ersatzkette: gewählte Stimme, g38l, g38, g31 (Kore 3.1, nur noch stiller Ersatz), elj. Die Browserstimme kommt nur als allerletzter Notbehelf.
- Speicher im Browser: localStorage `zo_prov` (Bildprogramm), `zo_voice`, `zo_projs`. Projekte und Bilder liegen in IndexedDB `zenoffice`.

## 3. Kernelemente & Anker-Code (nicht ohne Not ändern)

**Vision, Erzeugen:**
- `genImg()` legt pro Klick eine eigene Karte an. Bilder dürfen parallel entstehen.
- Die Stufe wird beim Klick gemerkt. `vRunning` zählt die laufenden Aufträge für die Anzeige.
- `genByProv(prompt, opt)` verteilt auf `genGoogle`, `genFal` oder `genAlibaba`.
- `editFields(opt)` setzt `refImages`, `aspect`, `editMode` und `maskImage`.
- `useGoogle === false` bedeutet: wirklich Flux nehmen. Das ist der frühere Fehler, bei dem der Server immer zuerst Google probierte.

**Vision, Werkzeuge** (Knopf „Bearbeiten“ auf jeder Karte öffnet `#vt-ovl`):
- Modi:
  - `edit`: Ändern
  - `mask`: Maskieren
  - `erase`: Magic Eraser
  - `expand`: Erweitern auf 16:9, 4:3, 1:1, 3:4, 9:16 oder rundum
- **Grundlage ist immer das Bild der angeklickten Karte**, nicht das Referenzbild. Es geht als einzige Referenz mit (`opt.refs = [base]`). Das Ergebnis wird eine **neue Karte** direkt über dem Ausgangsbild.
- Maske: weiß bedeutet „ändern“, gleiche Größe wie das Bild (`VT.mask`, `maskPng`).
- `blendWithMask()` verschmilzt außerhalb der Maske pixelgenau mit dem Original. Beim Erweitern ist das immer an, sonst über die Checkbox.
- Flux mit Maske: `fal-ai/flux-pro/v1/fill`. Gemini und Alibaba bekommen die Maske als zweites Bild.
- `toEditInstruction()`: Claude Haiku formuliert den deutschen Wunsch vorher als konkrete englische Anweisung. Sie wird auf der Karte mit „→“ angezeigt.
- Die Anweisungen an die Modelle (`editPrompts` in `api/image.js` und `api/alibaba.js`) verlangen ausdrücklich eine **klar sichtbare Änderung**. Ältere „ändere nur minimal“-Formulierungen lieferten fast identische Bilder.
- Bei Referenzbildern ohne Bearbeiten dient die Referenz nur für Identität und Stil. Die Wünsche des Nutzers haben Vorrang.

**Weitere Vision-Funktionen:**
- `analyzeV()` schickt das Bild selbst (verkleinert, Base64) an Claude. Die ausführliche deutsche Analyse in 5 Abschnitten und die Zeile `PROMPT:` erscheinen im Fenster `#wissen-ovl`. Der Knopf „Prompt übernehmen“ (`analysisToVision`) setzt den Prompt ins Anweisungsfeld.
- Zurück/Vor:
  - Karten: `visTrack`, `visUndo`, `visRedo`
  - Pinselstriche: `vtSnap`, `vtUndo`, `vtRedo`, bis zu 30 Schritte
- `shrinkImg()`: Referenzbilder und Bearbeitungsbilder werden auf höchstens 1536 px (JPEG) verkleinert. Vercel erlaubt nur etwa 4,5 MB pro Anfrage, sonst kommt **Fehler 413** (`TOO_BIG`).
- Bilder hineinziehen (`initVisDrop`): auf die Bildfläche `#varea` gezogen → eigene Karte „Eigenes Bild“ (`addUploadCard`) mit Bearbeiten/Analyse; auf die Steuerung `.vctrl` gezogen → Referenzbild. Datei-Ablegen anderswo wird abgefangen, damit der Browser das Bild nicht selbst öffnet.
- `fitVImg()`: Der Bildrahmen übernimmt das echte Seitenverhältnis (`object-fit: contain`). Nichts wird abgeschnitten.

**Alibaba (`api/alibaba.js`):**
- Ablauf: zuerst asynchronen Auftrag anlegen, der Browser fragt alle 3 s nach (bis 5 min). Lehnt Alibaba den Auftragsweg ab, folgt ein direkter Aufruf, bei Qwen 3.x mit `enable_thinking: false`. Das war die Lösung für Fehler 504 bei Pro.
- Fertige Bilder werden als Data-URI eingebettet, weil Alibaba-Links nach 24 h verfallen.
- Inhaltsfilter „Green net check“ ist sehr streng. Wörter wie „Brust“ oder „intim“ führen zur Ablehnung. Ausweg: umformulieren oder Flux/Gemini nehmen.
- Arbeitsbereich Frankfurt `ws-cbf9073m7wec0cdo`, Umfang „Global“. Die Modelle müssen dort unter Model Invocation **autorisiert** sein.

**Text:**
- Die KI-Leiste ist ein Eingabefeld mit zwei Symbolknöpfen: Lupe = Wissen (Antwort im eigenen Fenster `#wissen-ovl`, Text bleibt unberührt), Stift = Ändern (direkt im Text). Es gibt keine große Knopfreihe und keine Hinweiszeile.
- Antwortfenster mit Gesprächsverlauf: Feld „Folgefrage stellen…“ (`wissenFollow`). `wissenHist` wird als ganzer Verlauf an Claude geschickt (`callClaude` nimmt auch ein Array). Jede Antwort hat einen eigenen „Kopieren“-Knopf, der Knopf unten kopiert die neueste. Ein neues Öffnen beginnt ein neues Gespräch. Bei der Bildanalyse gibt es kein Folgefeld.
- **Auf allen Geräten gleich:** Enter im KI-Feld löst nichts aus (`kiEnter`, nur Hinweis bzw. Tastatur schließen). Der Nutzer will keine Unterschiede zwischen PC, Handy und Tablet bei Wissen/Ändern.
- Ändern: Die Anweisung an Claude verlangt vollständige Umsetzung (nicht „verändere sonst nichts“). Bleibt der Text unverändert, kommt ein Hinweis statt einer falschen Erfolgsmeldung.
- Diktat (`startDicEngine`): Chrome auf Android liefert denselben Satz mehrfach und wachsend; deshalb wächst der gesprochene Satz live in einem Platzhalter `span.dicl` (`dicText` führt wiederholte Fassungen zusammen) und wird bei Sitzungsende einmal festgeschrieben (`dicCommit`), Satzanfang groß. Auf Touch (`body.touch`): durchsichtiger runder Mikrofonknopf (68 px, `.dicbig`, `position:fixed`), schwebt rechts im unteren Drittel (Daumen), pulsiert beim Diktat rot; bleibt sichtbar, auch wenn die Leisten weggleiten; Tastatur bleibt beim Diktat zu (`inputmode=none`), Antippen des Textes beendet das Diktat; die grüne Diktat-Pille `#dicleg` nur am PC. Seit 2026-10-28 in Erprobung.
- Touch-Geräte (nur `pointer:coarse`, nicht am PC): Werkzeugleiste 37 px, runde Symbolknöpfe 46 px (Wunsch: zweimal 20 % kleiner); KI-Leiste unverändert. Werkzeug- und KI-Leiste liegen gemeinsam in `#tools`: **Schreiben oder Diktieren im Text lässt sie nach oben weggleiten** (`hideTools`, negatives margin-top, kein Springen), **ein kurzer Wisch nach unten (> 40 px) holt sie zurück** (`initToolsAutoHide`). Scrollen allein schaltet nichts um – früher schaukelte sich scrollgesteuertes Aus-/Einblenden auf (starkes Flimmern beim Diktieren, 2026-10-28). `keepAppInView()` greift nur ein, wenn die Tastatur die Seite wirklich verdeckt, höchstens einmal pro Bild; `interactive-widget=resizes-content` erledigt den Rest.
- Bilder im Text (`insertEdImg`): per Importieren, Hineinziehen oder Einfügen (Strg+V), auf 1600 px verkleinert, zunächst 50 % breit. Antippen zeigt die Leiste `#imgbar` (S 25 % / M 50 % / L 75 % / Voll, ✕) und einen Ziehpunkt `#imggrip` für freie Größe sowie Ausrichtung links/mittig/rechts (`imgAlign`, links/rechts per `float`, Text umfließt das Bild; mittig steht es allein, beidseitiges Umfließen kann HTML nicht); der Rahmen `#imgbox` liegt außerhalb des Textes, damit nichts davon mitgespeichert wird.
- KI-Textänderungen (Optimieren, Stil, Übersetzen, Ändern) behalten Bilder: `edTextWithImgs` ersetzt sie durch Platzhalter `[[BILD1]]`, `setEdTextWithImgs` setzt sie danach wieder ein (fehlende ans Ende), `IMG_HINT` sagt der KI, sie stehen zu lassen. Bei Markierungen `replaceRangeKeepImgs`.
- Schriftgröße (`#fssel`, `setFS`): Klein 15 / Normal 19 / Groß 24 px (früher 13/15/19; die alte kleinste Stufe entfiel auf Wunsch), Standard Klein, Wahl gemerkt in localStorage `zo_fs`.
- Vorlesen (`toggleSpeak`): Ist im Text etwas markiert (`lastEdRange`), wird nur die Markierung vorgelesen, sonst der ganze Text.
- `#dtitle` zeigt im Textbereich den Platzhalter „Textname…“.
- Werkzeugleiste: auf dem PC eine Reihe, auf dem Handy **zwei Reihen**, die gemeinsam seitlich wischen (`.tbi`/`.tbr`). Alle Funktionen bleiben erhalten.

## 4. Regeln & Constraints

**Arbeitsweise mit dem Nutzer:**
- Der Nutzer ist Technik-Einsteiger. Erkläre Klick für Klick und ohne Fachjargon. Fachbegriffe wie Branch, Vorschau oder Deploy brauchen einen Alltagsvergleich.
- Er diktiert oft, deshalb können Wörter verdreht sein (z. B. „Chore“ = Kore, „Solafat“ = Sulafat).
- Antwort-Knöpfe schicken bei ihm oft nur den Satzanfang ohne Details. Dann nach dem genauen Text oder einem Screenshot fragen.
- Sein Browser übersetzt Webseiten automatisch. Das hat GitHub-Code-Eingabe und Alibaba-Konsole (weiße Seiten) kaputt gemacht. Bei hakenden Web-Oberflächen zuerst die Übersetzung abschalten lassen.
- Ursachen erst **im Code bzw. System prüfen**, dann antworten. Nicht raten und nicht pauschal antworten.
- Ehrlich sagen, was nur mit Attrappen getestet ist und was der Nutzer selbst prüfen muss. Echte API-Aufrufe kosten sein Geld und brauchen vorher seine Zustimmung.

**Ablauf bei Änderungen:**
1. Neuer Branch (der Nutzer bestätigt ihn jeweils).
2. Lokal testen: lokaler Server (`npx http-server`), Browser-Prüfung, Attrappen für die API-Aufrufe.
3. Push. Vercel baut eine **Vorschau** (Eintrag „Preview“ mit Branch-Namen). Nur den Branch-Namen nennen – **keine Anleitungen, wie oder wo man testet**; der Nutzer kennt den Weg und fragt selbst, wenn nötig (Wunsch vom 2026-10-28).
4. Der Nutzer testet in der Vorschau.
5. **Erst auf seinen ausdrücklichen Wunsch** per Fast-Forward in `main` übernehmen und pushen. Danach prüfen, ob zen-office-cl.vercel.app die neue Version zeigt.
- Commit-Nachrichten auf Deutsch, mit `Co-Authored-By`-Zeile.
- Neue Vercel-Variablen wirken erst nach einem neuen Bau. Notfalls einen leeren Commit pushen.

**UI/UX und Code-Stil:**
- Dunkles, warmes Design mit Gold-, Salbei- und Rosé-Tönen, abgerundeten Knöpfen und Pillen. Hell/Dunkel ist umschaltbar.
- Kompakt bleiben, besonders auf dem Handy. Nichts entfernen, was der Nutzer behalten will.
- Code wie der bestehende: knappes Vanilla-JS, deutsche Kommentare, Funktionen im globalen Script. Keine Bibliotheken, kein Build-Schritt.
- Jede Modellumstellung bekommt eine **Ersatzkette** (neuer Name zuerst, alter als Ersatz).
- Desktop-Symbol bunt, in der App das dezente Sepia-Logo (fest als Base64 eingebettet). Das Tab-Symbol bleibt alt.
- Windows merkt sich Desktop-Symbole nach Dateinamen. Für einen Symbolwechsel an einer bestehenden Verknüpfung eine Datei mit neuem Namen verwenden.

## 5. Offene Punkte & nächste Schritte

- Echte Tests mit den Live-Diensten stehen teilweise noch aus. Der Nutzer probiert sie nach und nach aus:
  - Claude 5.5 in allen Stufen
  - Gemini 3.6 Flash (Übersetzen)
  - Bearbeiten mit allen drei Bildprogrammen
- Mögliche Ideen, auf Wunsch des Nutzers:
  - Bei abgelehntem Alibaba-Text automatisch mit Flux weitermachen
  - Weitere Männerstimmen zur Auswahl (z. B. Google Algieba)
- Der Fehler 413 kann bei sehr langen Vorlese-Texten theoretisch auch bei `api/tts.js` auftreten (WAV-Antwort über 4,5 MB). Bisher ist das nicht beobachtet worden.
- Diese Datei bei größeren Änderungen aktuell halten.

# ZenOffice · Claude Edition

Arbeitssprache mit dem Nutzer ist **Deutsch**. Stand dieser Beschreibung: 2026-11-08.

## 1. Projekt-Übersicht & Ziel

ZenOffice Claude Edition ist eine KI-gestützte Office-App mit drei Bereichen: **Text**, **Tabelle** und **Vision** (Bilder). Sie soll ansprechend und übersichtlich sein und trotzdem viel können. Sie läuft im Browser und als installierbare App (PWA) auf PC und Handy.

- **Live:** https://zen-office-cl.vercel.app (Vercel-Projekt `zen-office-cl`, Team `alberts-s-projects`)
- **Repository:** `EdZett/ZenOffice_Cl` (öffentlich), Hauptzweig `main`
- **Lokal:** `C:\Users\Albert\antigravity\ZenOffice_Cl`
- **Tech-Stack:** eine einzige `index.html` (HTML, CSS und Vanilla-JS, ohne Build-Schritt und ohne Framework) plus Vercel-Serverless-Funktionen in `api/` (Node, `export default handler`). Es gibt keine `package.json` und keine Abhängigkeiten.
- **Schlüssel** liegen nur als Vercel-Umgebungsvariablen vor und sind nie im Code: `CLAUDE_KEY`, `GOOGLE_KEY`, `FAL_KEY`, `ALIBABA_KEY` (optional `ALIBABA_BASE_URL`), für den Geräte-Abgleich der Blob-Speicher „zenoffice-sync“ (Private, FRA1, angelegt 2026-11-08): Vercel legt dafür nur noch `BLOB_STORE_ID` (+ eine `BLOB_…_KEY`) an und authentifiziert per OIDC (Kopf `x-vercel-oidc-token` je Anfrage) – kein `BLOB_READ_WRITE_TOKEN` mehr; `api/sync.js` kann beides.
- **Schwesterprojekte** (nicht verwechseln): ZenOffice-Gold, ZenOffice_Studio, ZenOffice_Lab sowie die Gemini-Version unter `C:\Users\Albert\antigravity\ZenOffice` (React/TS). Die Gemini-Version diente als Vorbild für Maskieren, Magic Eraser und Erweitern (`src/components/AiImageModule.tsx`).

**Aktueller Stand:** Alles Folgende ist veröffentlicht und läuft:

- Text: Optimieren, Stil, Übersetzen, Wissen/Ändern-Leiste, Diktat und Vorlesen mit Stimmenwahl
- Tabelle
- Vision mit drei Bildprogrammen (Gemini, Flux, Alibaba) in je drei Stufen
- Bildanalyse, Bearbeitungswerkzeuge sowie Zurück/Vor
- Neues Desktop-Symbol
- Diktier-App `/diktat/` (eigene App, Premium-Erkennung mit Gemini, Glätten in Stufen)

## 2. Architektur & Module

```
index.html          ganze App (~2100 Zeilen): CSS oben, HTML, dann <script>
api/claude.js       Claude-Proxy (Messages API), Modell-Ersatzkette, effort "low" für 5.5-Modelle
api/gemini.js       Gemini-Text (Übersetzen, Zauberstab), Ersatzkette
api/image.js        Gemini- und Flux-Bilder: Erzeugen, Referenzbilder, Bearbeiten, Maske/Füllen
api/alibaba.js      Alibaba Qwen/Wan (Frankfurt): Auftrag anlegen, dann Abholen im Browser
api/tts.js          Vorlesen: Gemini-TTS-Stimmen und ElevenLabs über fal.ai, Ersatzkette
api/stt.js          Premium-Spracherkennung der Diktier-App (WAV → Gemini), Ersatzkette, maxDuration 60 s
api/sync.js         Geräte-Abgleich über Vercel Blob (ohne Paket, Blob-API v13 wie @vercel/blob 2.8): list/get/put/del, Zugang per BLOB_STORE_ID+OIDC oder BLOB_READ_WRITE_TOKEN; maxDuration 60 s
api/imagen4.js      Google Imagen 4 (nicht in der Oberfläche erreichbar)
manifest.json       PWA-Manifest (Symbole ?v=2, purpose "any")
diktat/index.html   eigene Diktier-App (eigenständige Seite, eigenes Manifest diktat/manifest.json mit id/scope /diktat/, eigenes Symbol diktat-icon-*.png); Link in der Seitenleiste „Diktier-App“
sw.js               Service Worker, Cache "zenoffice-claude-v5" (Offline-Ersatz für /diktat/ eigene Seite), /api/* nie gecacht; App-Seite „erst Netz, dann Speicher“ (früher umgekehrt → nach Updates zuerst alte Version); neuer SW lädt die Seite einmal neu
vercel.json         Header (auch diktat/manifest.json); maxDuration 60 s für api/alibaba.js und api/stt.js
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
- **Geräte-Abgleich** (2026-11-08; Chrome-Sync gleicht Webseiten-Daten NICHT ab, Tablet nutzt zudem den Huawei-Browser): Einstellungen → „Geräte-Abgleich“, Sync-Schlüssel (localStorage `zo_sync_key`, mind. 8 Zeichen, „Neuen Schlüssel erzeugen“). `api/sync.js` legt unter `zo/<sha256(Schlüssel)>/p/<id>__<zeit>.json` je Projekt ab (Bilder als JPEG ≤ 1600 px als Data-URI), Löschungen als Merkzettel `d/<id>__<zeit>`. `syncNow()`: eigene Löschungen (localStorage `zo_sync_dels`) hochgeben → anderswo Gelöschtes hier entfernen → Neueres hochladen (`p.date`) → Neueres/Fehlendes holen; offener Text wird aufgefrischt, außer man schreibt gerade. Auslöser: Start, `setProjs` (4 s verzögert), Rückkehr in die App, alle 2 min, Knopf ⟳ neben „Meine Projekte“ (Farbe zeigt Zustand). Fehlt der Speicher: Meldung „Online-Speicher ist bei Vercel noch nicht eingerichtet“. Vercel Blob Hobby: ca. 1 GB frei, bei Überschreiten pausiert er (keine Kosten). Getestet nur mit nachgebautem Blob-Speicher.
- **Projektliste** (`renderProjs`, 2026-11-08): Zeile = Titel + drei Symbolknöpfe 34 px (Touch 40 px): Speichern als Datei (blau), Archiv (gold), Löschen (rosé). „Auswählen“ → Häkchen, „Alle“, „Löschen (n)“ (`removeProjs`, gibt Löschung an den Abgleich weiter). Vorher verschachtelte Knöpfe mit kleinen Zeichen ↓ 📦 ✕.

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

**Bild-Projekte** (2026-11-08, wie Texte): Ein Bild-Projekt = alle Karten der Vision-Fläche (erstes Bild + Bearbeitungen/Varianten), `p.cards=[{key|url,prompt,badge}]` (alt: `p.imgKey`, wird beim nächsten Speichern umgewandelt; `visProjCards`). Fertige Bilder (Erstellen, Bearbeiten, eigenes Bild) speichert `visSaved` automatisch (`saveVisProj`), Name = Feld oben (`autoSaveTitle` speichert jetzt auch in Vision). „＋ Neu“ neben „Vision“ und erster Knopf der Anweisungs-Leiste (`newVision`) → leere Fläche. Klick auf ein Projekt (`showVisProj`) leert die Fläche und zeigt NUR dessen Bilder (früher sammelten sich alle angeklickten Bilder). Zurück/Vor ändern das Projekt mit. Letztes Bild-Projekt kommt beim Start zurück (localStorage `zo_lastvis`). Während Bilder entstehen, kein Projektwechsel (`visBusy`). Karten-Knopf heißt jetzt nur „Download“. Abgleich schickt alle Bilder eines Projekts als JPEG (max. ~4 MB je Projekt).

**Tabellen-Projekte** (2026-11-08): Vorher wurde eine erstellte Tabelle nirgends gespeichert und war nicht änderbar. Jetzt: jede „Erstellen“-Tabelle = eigenes Projekt (type `sheet`, `html` = nur die `<table>`), Zellen per `contentEditable` änderbar (Eingaben speichern nach 0,8 s, `saveSheetProj`), Name = Feld oben, „＋ Neu“ neben „Tabelle“ und Knopf in der Leiste (`newSheet`; der alte Papierkorb „Leeren“ entfiel), Download als CSV (Semikolon + BOM für Excel/LibreOffice, `sheetCsv`), letzte Tabelle kommt beim Start zurück (localStorage `zo_lastsheet`), Abgleich wie Texte. „Analysieren“ hängt seine Antwort nur an, sie wird nicht gespeichert.

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
- Diktat (`startDicEngine`): Chrome auf Android liefert denselben Satz mehrfach und wachsend; deshalb wächst der gesprochene Satz live in einem Platzhalter `span.dicl` (`dicText` führt wiederholte Fassungen zusammen) und wird bei Sitzungsende einmal festgeschrieben (`dicCommit`), Satzanfang groß. Auf Touch (`body.touch`): durchsichtiger runder Mikrofonknopf (68 px, `.dicbig`, `position:fixed`), schwebt rechts im unteren Drittel (Daumen), pulsiert beim Diktat rot; bleibt sichtbar, auch wenn die Leisten weggleiten; Tastatur bleibt beim Diktat zu (`inputmode=none`), Antippen des Textes beendet das Diktat; die grüne Diktat-Pille `#dicleg` nur am PC. Seit 2026-10-28 in Erprobung. Neustart nach Rundenende jetzt sofort (ohne 150 ms), wegen des Huawei-Browsers (2026-11-08). **Premium auch hier** (2026-11-08): Knopf „Browser/Premium“ neben DE (`#diceng`, `toggleDicEngine`, gleiche Wahl wie die Diktier-App: localStorage `zo_dk_engine`). `startPremiumMain` nimmt wie die Diktier-App auf (Stücke bei Pause > 2,5 s ab 15 s Sprache bzw. 55 s, `dicWav16` mit Lautstärke-Angleich, `api/stt.js` mit Text vor der Schreibstelle als Zusammenhang); Text wächst im Platzhalter `span.dicl` an der Cursor-Stelle (`pmSpan`, `_pend` zählt offene Antworten), `pmCommit` schreibt ihn fest. 10 s Stille → `stopDic`.
- Touch-Geräte (nur `pointer:coarse`, nicht am PC): Werkzeugleiste 37 px, runde Symbolknöpfe 46 px (Wunsch: zweimal 20 % kleiner); KI-Leiste unverändert. Werkzeug- und KI-Leiste liegen gemeinsam in `#tools`: **Schreiben oder Diktieren im Text lässt sie nach oben weggleiten** (`hideTools`, negatives margin-top, kein Springen), **ein kurzer Wisch nach unten (> 40 px) holt sie zurück** (`initToolsAutoHide`). Scrollen allein schaltet nichts um – früher schaukelte sich scrollgesteuertes Aus-/Einblenden auf (starkes Flimmern beim Diktieren, 2026-10-28). `keepAppInView()` greift nur ein, wenn die Tastatur die Seite wirklich verdeckt, höchstens einmal pro Bild; `interactive-widget=resizes-content` erledigt den Rest.
- Bilder im Text (`insertEdImg`): per Importieren, Hineinziehen oder Einfügen (Strg+V), auf 1600 px verkleinert, zunächst 50 % breit. Antippen zeigt die Leiste `#imgbar` (S 25 % / M 50 % / L 75 % / Voll, ✕) und einen Ziehpunkt `#imggrip` für freie Größe sowie Ausrichtung links/mittig/rechts (`imgAlign`, links/rechts per `float`, Text umfließt das Bild; mittig steht es allein, beidseitiges Umfließen kann HTML nicht); der Rahmen `#imgbox` liegt außerhalb des Textes, damit nichts davon mitgespeichert wird.
- KI-Textänderungen (Optimieren, Stil, Übersetzen, Ändern) behalten Bilder: `edTextWithImgs` ersetzt sie durch Platzhalter `[[BILD1]]`, `setEdTextWithImgs` setzt sie danach wieder ein (fehlende ans Ende), `IMG_HINT` sagt der KI, sie stehen zu lassen. Bei Markierungen `replaceRangeKeepImgs`.
- Schriftgröße (`#fssel`, `setFS`): Klein 15 / Normal 19 / Groß 24 px (früher 13/15/19; die alte kleinste Stufe entfiel auf Wunsch), Standard Klein, Wahl gemerkt in localStorage `zo_fs`.
- Vorlesen (`toggleSpeak`): Ist im Text etwas markiert (`lastEdRange`), wird nur die Markierung vorgelesen, sonst der ganze Text.
- **Gezieltes Ändern & Sprachbefehle** (2026-11-08, nach Gemini-Tipps „Intent/Diff/Anker“, angepasst): `edParas()` zerlegt den Editor in Absätze (Zeilenumbruch/Block = neu, leere zählen nicht). „Ändern“ (Stift) ruft zuerst `kiPrecise`: Claude bekommt „[N] Text“ mit Markierung ⟦…⟧ und Cursor ‸ und antwortet als JSON `{aenderungen:[{absatz,alt,neu}],neue_absaetze:[{nach,text}],antwort}`; die App tauscht nur diese Stellen (Leerzeichen-tolerant), markiert sie kurz golden (`span.kichg`, wird wieder entfernt), meldet nicht Gefundenes statt zu raten; Fragen → `antwort` im Wissen-Fenster. Ungültiges JSON → alte Gesamt-Änderung als Ersatz. **Blasse Absatznummern** am Rand (`#pnums`, `drawPnums`, MutationObserver; nie im Text/Druck – Wunsch des Nutzers, damit er „Absatz 3“ sagen kann). **Mikrofon in der KI-Leiste** (`kiMic`, gold): Befehl sprechen → `runVoiceCmd` → wie „Ändern“; Premium per Aufnahme→`api/stt.js` (Ende bei 2,5 s Stille), sonst Browser-Erkennung. **„Achtung Befehl“** im Diktat (Browser `dicCommit`, Premium-Antwort): Text davor bleibt Diktat, danach = Befehl (`splitCmd`, `CMD_RE`; kommt der Befehl erst im nächsten Stück, `cmdPending`). Wunschwort des Nutzers statt „ZenOffice“ (wurde als „10 Office“ verstanden) bzw. „Befehl“ allein (kommt in Berichten vor). In der Diktier-App gibt es „Achtung Befehl“ noch nicht. Erste echte Tests (2026-11-08): Haiku nahm Erläuterungen im gesprochenen Befehl („kein Punkt, kein Heb“) wörtlich in den Text und plauderte im Antwortfenster → `kiPrecise` nutzt jetzt mindestens Sonnet (Flash), die Anweisung erklärt gesprochene Korrekturen mit Beispiel, bei Änderungen kein Antwortfenster mehr. Premium-Diktat im Textbereich schickt Stücke schon bei 2 s Pause ab 4 s Sprache (vorher 15 s) – sonst wirkte „Achtung Befehl“ erst viel später; Rückmeldung „Achtung Befehl erkannt – sprich jetzt den Befehl“.
- **Sprachnachricht / Audio → Text** (2026-11-08): Importieren-Menü „Sprachnachricht / Audio → Text“ (`#up-aud`) oder Audiodatei in den Text ziehen → `audioToText`. Gemini (`api/stt.js`, `mode:'file'`) liefert „Mitschrift“ in den gesprochenen Sprachen (gemischt möglich, mehrere Sprecher als „Person A/B…“) und „Deutsche Übersetzung“ → neuer Text „Sprachnachricht <Dateiname>“. Bis 2,8 MB und 6 min (opus/ogg/mp3/wav/aac/flac) am Stück, sonst im Browser entpackt und in 50-s-WAV-Teilen. **„Teilen an ZenOffice“** (2026-11-08): `manifest.json` `share_target` (POST multipart an `/share-target`, Audio + Text/Link); `sw.js` (Cache `zenoffice-claude-v6`) legt Datei/Text im Cache `zo-share` ab und leitet auf `/?share=1`; `takeShared()` (nach `initProjs`) startet `audioToText` bzw. legt einen neuen Text an. Funktioniert nur mit echt installierter App (WebAPK, z. B. Chrome auf dem OPPO-Handy des Nutzers), nicht mit Huawei-Verknüpfungen; bei schon installierter App ggf. neu installieren, damit Android das neue Manifest kennt. **Bestätigt 2026-11-08:** auf dem OPPO erst nach Neuinstallation sichtbar, dann funktionierte es. WhatsApp „Herunterladen“ legt Sprachnachrichten NICHT in „Download“, sondern intern unter Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes. Langfristiges Ziel des Nutzers: Gespräche mit 3 Personen den Sprechern zuordnen und mit 3 verschiedenen Stimmen neu vertonen (wie NotebookLM) – noch nicht gebaut.
- `#dtitle` zeigt im Textbereich den Platzhalter „Textname…“.
- **Neuer Text** (`newText`, 2026-11-08): erster Knopf der Werkzeugleiste und „＋ Neu“ neben „Text“ in der Seitenleiste. Speichert den bisherigen Text (`flushSave`), legt sofort einen Eintrag „Neuer Text“ in „Meine Projekte“ an (wird beim Schreiben umbenannt), räumt nie beschriebene „Neuer Text“-Einträge auf. Vorher gab es keinen Weg zu einem neuen Text außer „Löschen“.
- Werkzeugleiste: auf dem PC eine Reihe, auf dem Handy **zwei Reihen**, die gemeinsam seitlich wischen (`.tbi`/`.tbr`). Alle Funktionen bleiben erhalten.

**Diktier-App (`/diktat/`, seit 2026-11-03, in `main`):**
- Ziel: Sprache für jedes Eingabefeld (auch andere Apps) – sprechen, von Hand nachbessern, glätten, Zwischenablage, dort einfügen. Für das Tablet gebaut. Der Nutzer installiert Apps über den **Huawei-Browser** (Chrome-Apps entfernt Huawei nach jedem Neustart).
- **Mikrofon startet NICHT mehr von selbst** (Wunsch 2026-11-08: das automatische Aufnehmen beim Öffnen/Zurückkehren setzte unter Druck) – weder beim Öffnen, noch beim Zurückkehren, noch nach „Neuer Text“; nur per Tipp aufs Mikrofon. Geht die App in den Hintergrund, wird eine Aufnahme angehalten. (Der Autoplay-Hinweis „einmal tippen“ bei Premium tritt damit praktisch nicht mehr auf.) **Mikrofon = Aufnahme an/Pause**, es wird immer am vorhandenen Text weitergeschrieben; eine leere Seite gibt es nur über „Neuer Text“ (früher zwei verwirrende „Weiter“/„Start“-Wege, 2026-11-03). Vorhandener Text wird nie von selbst gelöscht.
- **Text antippen während der Aufnahme = anhalten** (`pointerdown`), dann frei von Hand ändern (Tastatur), Mikrofon setzt am Ende fort.
- Stille beendet nur die Aufnahme (Pause), **geglättet wird erst auf Knopfdruck**: großer grüner Knopf rechts „Glätten & kopieren“ (`goTap`; bei Glätten aus nur „Kopieren“).
- Glätten: Claude Haiku in Stufen (siehe „Glätten in Stufen“ unten). Die persönliche Diktierregel des Nutzers (`MY_RULE`) gibt es nur noch in der Haupt-App unter „Optimieren → Meine Diktierregel“.
- Weitere Knöpfe: Kopieren, Original/Geglättet, Verlauf (letzte 15, localStorage `zo_dk_hist`; Antippen = übernehmen + kopieren; **einzeln löschen per Mülleimer oder Wisch nach links**). Laufender Text in `zo_dk_cur`, landet nach App-Schließen beim nächsten Öffnen im Verlauf. Schalter: DE/EN (`zo_dk_lang`), Glätten-Stufe (`zo_dk_smooth`), Hell/Dunkel (`zo_dk_light`). Wake Lock beim Aufnehmen.
- **Erkennung wählbar** (Knopf oben „Browser“/„Premium“, localStorage `zo_dk_engine`, Standard Browser): Browser = Web Speech API des Browsers (kostenlos, live; im Huawei-Browser schwächer, z. B. Kleinschreibung). Premium = eigene Aufnahme (`getUserMedia` + ScriptProcessor), in langen Stücken (Pause > 2,5 s erst ab 15 s Sprache, spätestens 55 s, sonst beim Anhalten) als 16-kHz-WAV (AudioContext mit sampleRate 16000, Echo-Unterdrückung aus) an `api/stt.js` → Gemini schreibt wortgetreu mit (Ersatzkette gemini-3.6-flash → gemini-3-flash-preview → gemini-2.5-flash), bisheriger Text (600 Zeichen) geht als Zusammenhang mit; Knopf „Anhören“ spielt die Aufnahme ab (zur Unterscheidung Mikrofon- vs. Erkennungsproblem). Früher 2–3-s-Schnipsel ohne Zusammenhang → Gemini riet („glätten“ → „klettern“) und erfand Sätze (2026-11-03). Kostet pro Aufnahme etwas. Stücke laufen nacheinander (`sttChain`), „Neuer Text“ verwirft Laufendes (`sttGen`). Beim automatischen Start ohne Fingertipp ruht der AudioContext (Autoplay-Regel) → Hinweis „einmal aufs Mikrofon tippen“, `micTap` setzt dann nur fort. Nach **10 s** Stille Pause (Wunsch 2026-11-06, früher 2 min; Stille = Pegel unter 0,012). Premium ist für den Nutzer im Huawei-Browser die einzige brauchbare Erkennung. Seit 2026-11-03, noch nicht mit echtem Gemini getestet.
- Nach dem Glätten zeigt die Statuszeile, wie viele Wörter geändert wurden (`diffWords`) bzw. „Nichts zu glätten“ – Premium liefert oft schon sauberen Text, dann wirkte Glätten wie wirkungslos (2026-11-03). „Anhören“ spielt die eigene Sprachaufnahme ab, nicht den geglätteten Text (Nutzer hatte das verwechselt); 16 kHz reicht, Gemini rechnet Audio ohnehin auf 16 kHz herunter. Aufnahme war auf dem Huawei-Tablet sehr leise → `toWav16` gleicht die Lautstärke nach dem Sprachpegel an (90.-Perzentil der 20-ms-Pegel → 0,2, max. 30-fach, weiche Begrenzung per tanh); die erste Fassung nach dem Spitzenwert wirkte nicht, weil ein Knacken die Verstärkung verhinderte. Installation: Huawei-Browser legt nur eine Verknüpfung an (die bleibt – empfohlen). Chrome läuft beim Nutzer in **GBox** (Google-Hülle auf Huawei); dort angelegte Web-Apps verschwanden teils nach Neustart (Diktat, KI-Hub; Vercel/Venice/Copilot blieben) – Ursache liegt bei GBox/Huawei, nicht im Code. Berechtigung „Verknüpfungen installieren“ ist vorhanden. Laut Nutzer (2026-11-08) entstehen auf seinem Huawei-Gerät in **beiden** Browsern nur Verknüpfungen, keine echten Web-Apps (bei Chrome sieht es nur nach Installation aus) – Fenster-Verhalten von `window.open`/`target` dort ungeprüft.
- **Glätten in Stufen** (Knopf oben, zyklisch, `smoothLvl`, localStorage `zo_dk_smooth` 0/1/2): Aus · **Sanft** (verbessert holprige/ungenaue Formulierungen, Gedankengang und Tonfall bleiben, plus Schriftdeutsch- und Diktat-Regeln) · **Gründlich** (wörtlich die Anweisung von „Optimieren → Grammatik & Klang“ der Haupt-App, nur plus „Absätze erhalten“ – gefällt dem Nutzer am besten). Seine wörtliche Diktierregel steht nur noch in der Haupt-App („Meine Diktierregel“). Umgestellt 2026-11-03 auf Wunsch. Beide mit Haiku (wie „Optimieren“ bei Nano).
- Absätze: Zeilenumbrüche am Textende bleiben erhalten (`tailTrim` statt `trim`, `join` schreibt nach „\n“ ohne Leerzeichen und groß weiter); Glätten-Anweisungen (auch `MY_RULE`) verlangen, Absätze zu erhalten. Premium hängt per `setRangeText(…,'preserve')` an, damit Markierung/Schreibstelle bleiben. Textfeld ist während der Aufnahme nicht mehr `readOnly` (sonst ließ sich nichts markieren), nur beim Glätten.
- Glätten-Anweisung verlangt zusätzlich korrektes Schriftdeutsch (keine „geht's“, „erstmal“, „dran“; Füllwörter und Selbstkorrekturen raus) – „Sprachmelodie bewahren“ hatte Berlinerisch stehen lassen.
- **Huawei-Browser + „Browser“-Erkennung:** dessen Spracherkennung beendet die Runde nach ein, zwei Wörtern (Chrome erst nach längerer Pause) → ständiges An/Aus, beim Neustart gingen Wörter verloren. Neustart jetzt sofort (ohne 150 ms Wartezeit); nach 3 Runden unter 4 s Hinweis auf „Premium“ (nimmt durchgehend auf, kein An/Aus). Abschalten lässt sich das Verhalten des Huawei-Browsers nicht (2026-11-04).
- Piepen: Android piept bei jedem Start/Stopp der Spracherkennung (nicht abschaltbar). Neustart nach einer Runde nur, wenn gesprochen wurde; eine stumme Runde pausiert.
- Kein Knopf „Installieren“ mehr (auf Wunsch entfernt 2026-11-03: blieb nach der Installation sichtbar und funktionierte im Huawei-Browser nicht). Manifest-Links mit `crossorigin="use-credentials"` (geschützte Vercel-Vorschau). Im Huawei-Browser verlangt die Vorschau eine Vercel-/Google-Anmeldung, die Google dort verbietet → nur von der festen Adresse installieren. Falls der Huawei-Browser wegen der schon installierten ZenOffice (Scope „/“) ablehnt: Diktier-App unter eigener Domain anbieten.
- **Diktieren an der Cursor-Stelle** (2026-11-08): `startRec` merkt sich `insPos` (`caretPos()`: Cursor mitten im Text → dort, sonst Ende). Browser-Erkennung: `base`=Text davor, `tail`=Text danach, `glue()` setzt ein Leerzeichen davor; Premium fügt per `setRangeText` an `insPos` ein und rückt `insPos` weiter. Vorher landete alles am Ende.
- **Pfeil „ZenOffice →“** oben (`toZen`): öffnet die Haupt-App im **benannten Fenster** `zenoffice` (wird wiederverwendet, kein Fensterstapel; der Seitenleisten-Link „Diktier-App“ nutzt ebenso `target="zo-diktat"`) mit `/#zo-text=<Text>` (gleiche Adresse, darum ohne Speicher-Umweg); `takeDiktat()` in `index.html` (nach `restoreLastText` und bei `hashchange`) legt daraus einen **neuen Text** an und speichert ihn – der zuletzt bearbeitete Text bleibt in den Projekten. Von dort geht es mit Seitenleiste, Optimieren, „→ Vision senden“ weiter (2026-11-08).
- Nutzt denselben Service Worker `/sw.js` (Scope „/“) und `api/claude.js`; `dicText()` ist aus der Haupt-App kopiert.

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

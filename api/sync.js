// Geräte-Abgleich über Vercel Blob (ohne Zusatzpaket, direkt über die Blob-API wie @vercel/blob 2.x).
// Jedes Gerät meldet sich mit demselben persönlichen Sync-Schlüssel; daraus wird ein nicht erratbarer Ordner (SHA-256).
// Ablage je Projekt:   <ordner>/p/<id>__<zeit>.json   (Zeit = letzte Änderung, so reicht die Liste für den Vergleich)
// Gelöschte Projekte:  <ordner>/d/<id>__<zeit>        (Merkzettel, damit andere Geräte ebenfalls löschen)
// Braucht einen mit dem Projekt verbundenen Blob-Speicher: BLOB_STORE_ID (+ OIDC) oder BLOB_READ_WRITE_TOKEN.
import crypto from 'crypto';

const APIS = ['https://vercel.com/api/blob', 'https://blob.vercel-storage.com'];  // neu zuerst, alter Weg als Ersatz
const API_VERSION = '13';

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Zugang: neue Speicher verbindet Vercel nur noch mit BLOB_STORE_ID + OIDC-Ausweis (kommt bei jeder Anfrage
  // im Kopf „x-vercel-oidc-token“ mit), ältere mit BLOB_READ_WRITE_TOKEN – beides geht.
  const rw = process.env.BLOB_READ_WRITE_TOKEN;
  const oidc = req.headers?.['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  const sid = (process.env.BLOB_STORE_ID || '').trim().replace(/^store_/, '');
  let token, storeId;
  if (rw) { token = rw; storeId = rw.split('_')[3] || ''; }
  else if (oidc && sid) { token = oidc; storeId = sid; }
  else { res.status(503).json({ error: 'NOSTORE' }); return; }

  const { key, op, id, data, ts } = req.body || {};
  if (!key || String(key).length < 8) { res.status(400).json({ error: 'Sync-Schlüssel fehlt oder ist zu kurz' }); return; }
  const dir = 'zo/' + crypto.createHash('sha256').update('zenoffice:' + key).digest('hex').slice(0, 40) + '/';
  const safeId = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

  // ── Blob-API ──
  const headers = extra => ({ authorization: `Bearer ${token}`, 'x-api-version': API_VERSION, 'x-vercel-blob-store-id': storeId, ...extra });
  async function api(path, init) {
    let last;
    for (const base of APIS) {
      try {
        const r = await fetch(base + path, init);
        if ((r.status === 404 || r.status === 405) && base !== APIS[APIS.length - 1]) { last = r; continue; }
        return r;
      } catch (e) { last = e; }
    }
    if (last instanceof Error) throw last;
    return last;
  }
  let access = 'private';
  async function put(pathname, body, type) {
    const doPut = acc => api('/?' + new URLSearchParams({ pathname }), {
      method: 'PUT', body,
      headers: headers({ 'x-vercel-blob-access': acc, 'x-add-random-suffix': '0', 'x-allow-overwrite': '1', 'x-content-type': type })
    });
    let r = await doPut(access);
    if (!r.ok && access === 'private') {            // Speicher wurde als „öffentlich“ angelegt → so ablegen
      const t = await r.text();
      if (/access|public|private/i.test(t)) { access = 'public'; r = await doPut('public'); }
      else throw new Error('Speichern fehlgeschlagen: ' + t.slice(0, 200));
    }
    if (!r.ok) throw new Error('Speichern fehlgeschlagen: ' + (await r.text()).slice(0, 200));
    return r.json();
  }
  async function list(prefix) {
    const out = []; let cursor = '';
    for (let n = 0; n < 20; n++) {
      const q = new URLSearchParams({ prefix, limit: '1000' }); if (cursor) q.set('cursor', cursor);
      const r = await api('?' + q, { method: 'GET', headers: headers({}) });
      if (!r.ok) throw new Error('Liste fehlgeschlagen: ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      out.push(...(j.blobs || []));
      if (!j.hasMore) break; cursor = j.cursor;
    }
    return out;
  }
  async function del(urls) {
    if (!urls.length) return;
    const r = await api('/delete', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ urls }) });
    if (!r.ok) throw new Error('Löschen fehlgeschlagen: ' + (await r.text()).slice(0, 200));
  }
  const parse = b => { const m = b.pathname.slice(dir.length).match(/^([pd])\/(.+?)__(\d+)/); return m ? { kind: m[1], id: m[2], ts: +m[3], url: b.url, size: b.size } : null; };

  try {
    if (op === 'list') {
      const items = (await list(dir)).map(parse).filter(Boolean);
      res.status(200).json({ items: items.map(({ kind, id, ts, size }) => ({ kind, id, ts, size })) });
      return;
    }
    if (op === 'get') {
      const it = (await list(dir + 'p/' + safeId(id) + '__')).map(parse).filter(Boolean).sort((a, b) => b.ts - a.ts)[0];
      if (!it) { res.status(404).json({ error: 'nicht gefunden' }); return; }
      const r = await fetch(it.url, { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Laden fehlgeschlagen: ' + r.status);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(await r.text());
      return;
    }
    if (op === 'put') {
      const pid = safeId(id), t = Math.round(+ts || Date.now());
      if (!pid || !data) { res.status(400).json({ error: 'id/data fehlt' }); return; }
      const old = await list(dir + 'p/' + pid + '__');
      const tomb = await list(dir + 'd/' + pid + '__');
      await put(dir + 'p/' + pid + '__' + t + '.json', JSON.stringify(data), 'application/json');
      await del([...old.filter(b => !b.pathname.endsWith('__' + t + '.json')), ...tomb].map(b => b.url));
      res.status(200).json({ ok: true, ts: t });
      return;
    }
    if (op === 'del') {
      const ids = (Array.isArray(id) ? id : [id]).map(safeId).filter(Boolean), t = Date.now();
      const all = (await list(dir)).map(parse).filter(Boolean);
      for (const pid of ids) await put(dir + 'd/' + pid + '__' + t, String(t), 'text/plain');
      await del(all.filter(x => ids.includes(x.id)).map(x => x.url));
      res.status(200).json({ ok: true });
      return;
    }
    res.status(400).json({ error: 'unbekannte Aktion' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Données de l'app, enregistrées dans le téléphone.
// Stockage principal : IndexedDB (des centaines de Mo, adapté aux photos).
// localStorage (limité à ~5 Mo sur iPhone) ne sert plus que de secours si IndexedDB est indisponible.
(function (root) {
  const KEY = 'recette-app-v1';
  const DB_NAME = 'recette-app', OS = 'kv';
  const DEFAULTS = () => ({
    recettes: [],
    plan: {},            // { 'AAAA-MM-JJ': { midi: { id, pers }, soir: { id, pers } } }
    coches: {},          // { 'semaine|clé': true } articles cochés dans la liste de courses
    extras: {},          // { 'semaine': [{ id, texte, fait }] } articles ajoutés à la main
    reglages: { heureMidi: '12:30', heureSoir: '19:30', rappel: 30, pers: 2, repas: ['soir'] },
  });

  let data = DEFAULTS();
  let db = null;          // connexion IndexedDB (null = secours localStorage)
  let warned = false;
  let ready = false;       // aucune écriture avant la fin du chargement (évite d'écraser les données)

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(OS);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloquée'));
    });
  }
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OS, mode);
      const r = fn(tx.objectStore(OS));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Écriture annulée'));
    });
  }
  function apply(d) {
    data = Object.assign(DEFAULTS(), d || {});
    data.reglages = Object.assign(DEFAULTS().reglages, (d && d.reglages) || {});
  }
  function readLocal() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  // Chargement (asynchrone) : IndexedDB, avec reprise des anciennes données localStorage
  async function load() {
    try {
      db = await openDB();
      const saved = await idb('readonly', (s) => s.get('data'));
      const old = readLocal();
      if (saved) apply(saved);
      else if (old) {
        apply(old);
        await idb('readwrite', (s) => s.put(JSON.parse(JSON.stringify(data)), 'data'));
      }
      if (old) { try { localStorage.removeItem(KEY); } catch (e) {} } // libère l'ancien espace plein
    } catch (e) {
      console.warn('IndexedDB indisponible, secours localStorage', e);
      db = null;
      const old = readLocal();
      if (old) apply(old);
    }
    ready = true;
    return data;
  }

  // Écritures regroupées : une seule écriture même si save() est appelé 20 fois d'affilée
  let timer = null, writing = null, dirty = false;
  async function flush() {
    clearTimeout(timer); timer = null;
    if (!dirty) return writing;
    if (writing) { await writing; return flush(); }
    dirty = false;
    writing = (async () => {
      try {
        if (db) await idb('readwrite', (s) => s.put(JSON.parse(JSON.stringify(data)), 'data'));
        else localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {
        console.warn(e);
        if (!warned) {
          warned = true;
          alert("Impossible d'enregistrer dans le téléphone (mémoire pleine ?). Tes recettes restent sauvegardées sur GitHub si la synchronisation est activée.");
        }
      } finally { writing = null; }
    })();
    return writing;
  }
  function save(opts) {
    if (!ready) return false;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
    if (!(opts && opts.quiet) && root.Sync) root.Sync.schedule();
    return true;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    root.addEventListener && root.addEventListener('pagehide', () => flush());
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const Store = {
    get data() { return data; },
    get ready() { return ready; },
    load, save, flush, uid,
    recette(id) { return data.recettes.find(r => r.id === id); },
    upsert(r) {
      if (!r.id) r.id = uid();
      r.modifieLe = new Date().toISOString();
      delete r.partagee; // modifiée par ce téléphone : elle lui appartient
      const i = data.recettes.findIndex(x => x.id === r.id);
      if (i >= 0) data.recettes[i] = r; else { r.creeLe = r.modifieLe; data.recettes.unshift(r); }
      save(); return r;
    },
    remove(id) {
      data.recettes = data.recettes.filter(r => r.id !== id);
      for (const d of Object.keys(data.plan)) for (const m of Object.keys(data.plan[d])) if (data.plan[d][m] && data.plan[d][m].id === id) delete data.plan[d][m];
      save();
    },
    exportJSON() {
      const copy = Object.assign({}, data); delete copy.sync; delete copy.gemini; // le jeton GitHub et la clé Google ne partent jamais dans une sauvegarde
      return JSON.stringify(Object.assign({ format: 'recette-app', version: 1, exporteLe: new Date().toISOString() }, copy), null, 1);
    },
    importJSON(txt) {
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.recettes)) throw new Error('Fichier non reconnu');
      const ids = new Set(data.recettes.map(r => r.id));
      let n = 0;
      for (const r of d.recettes) { if (!ids.has(r.id)) { data.recettes.push(r); n++; } }
      data.plan = Object.assign({}, d.plan || {}, data.plan);
      save(); return n;
    },
    reset() { data = DEFAULTS(); save(); },
  };
  root.Store = Store;
})(this);

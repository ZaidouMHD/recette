// Données de l'app, enregistrées dans le téléphone (localStorage).
(function (root) {
  const KEY = 'recette-app-v1';
  const DEFAULTS = () => ({
    recettes: [],
    plan: {},            // { 'AAAA-MM-JJ': { midi: { id, pers }, soir: { id, pers } } }
    coches: {},          // { 'semaine|clé': true } articles cochés dans la liste de courses
    extras: {},          // { 'semaine': [{ id, texte, fait }] } articles ajoutés à la main
    reglages: { heureMidi: '12:30', heureSoir: '19:30', rappel: 30, pers: 2, repas: ['soir'] },
  });

  let data = DEFAULTS();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        data = Object.assign(DEFAULTS(), d);
        data.reglages = Object.assign(DEFAULTS().reglages, d.reglages || {});
      }
    } catch (e) { console.warn('Lecture des données impossible', e); }
    return data;
  }
  function save(opts) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      if (!(opts && opts.quiet) && root.Sync) root.Sync.schedule();
      return true;
    }
    catch (e) {
      console.warn(e);
      alert("Mémoire du téléphone pleine pour l'app : supprime quelques photos de recettes ou exporte une sauvegarde.");
      return false;
    }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const Store = {
    get data() { return data; },
    load, save, uid,
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
      const copy = Object.assign({}, data); delete copy.sync; // le jeton GitHub ne part jamais dans une sauvegarde
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

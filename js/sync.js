// Synchronisation avec un dépôt GitHub.
// Chaque recette = un fichier donnees/recettes/<id>.json ; la semaine, les courses et les réglages = donnees/semaine.json.
// donnees/catalogue.json regroupe toutes les recettes : le site public le lit pour que tout le monde en profite.
// Plusieurs téléphones connectés au même dépôt partagent ainsi les mêmes données.
(function (root) {
  const DIR = 'donnees/';
  const API = () => root.RECETTE_GH_API || 'https://api.github.com';
  // pas de suppression basée sur une liste qui vient d'être modifiée
  const SAFE_DELETE_DELAY = () => (root.RECETTE_SAFE_DELAY != null ? root.RECETTE_SAFE_DELAY : 2 * 60 * 1000);
  let timer = null, running = false, again = false;
  const listeners = [];
  const S = () => root.Store;
  const cfg = () => S().data.sync || null;
  const enabled = () => { const c = cfg(); return !!(c && c.owner && c.repo && c.token); };
  const emit = (ev) => listeners.forEach(f => { try { f(ev); } catch (e) { console.error(e); } });

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64 || '').replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function errMsg(status, detail) {
    if (status === 401) return 'Jeton GitHub invalide ou expiré.';
    if (status === 403) return /rate limit/i.test(detail || '') ? 'Trop de requêtes GitHub, réessaie dans un moment.' : 'Accès refusé : le jeton doit avoir la permission « Contents : Read and write » sur ce dépôt.';
    if (status === 404) return "Dépôt introuvable, ou le jeton n'y a pas accès.";
    if (status === 409 || status === 422) return 'Conflit de version';
    return `Erreur GitHub (${status})`;
  }
  async function gh(path, opts = {}, c = cfg()) {
    let res;
    try {
      res = await fetch(API() + path, {
        method: opts.method || 'GET',
        cache: 'no-store',
        headers: Object.assign({
          Authorization: 'Bearer ' + c.token,
          Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }, opts.body ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      const err = new Error('Pas de connexion Internet.'); err.offline = true; throw err;
    }
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      let detail = ''; try { detail = (await res.json()).message; } catch (_) {}
      const e = new Error(errMsg(res.status, detail)); e.status = res.status; e.detail = detail; throw e;
    }
    if (res.status === 204) return null;
    return opts.raw ? res.text() : res.json();
  }
  const repoPath = (c = cfg()) => `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`;
  const file = (p) => `${repoPath()}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;

  async function put(path, text, sha, message) {
    const body = { message, content: b64encode(text) };
    if (sha) body.sha = sha;
    const r = await gh(file(path), { method: 'PUT', body });
    return r.content.sha;
  }

  // Ce qui est partagé en plus des recettes
  function shared() {
    const d = S().data;
    return { plan: d.plan, extras: d.extras, coches: d.coches, reglages: d.reglages };
  }
  const snapOf = (o) => JSON.stringify(o);
  function mergeShared(remote) {
    const d = S().data;
    const plan = Object.assign({}, remote.plan || {});
    for (const [day, meals] of Object.entries(d.plan || {})) plan[day] = Object.assign({}, plan[day] || {}, meals);
    const extras = Object.assign({}, remote.extras || {});
    for (const [wk, list] of Object.entries(d.extras || {})) {
      const byId = new Map((extras[wk] || []).map(x => [x.id, x]));
      list.forEach(x => byId.set(x.id, x));
      extras[wk] = Array.from(byId.values());
    }
    d.plan = plan;
    d.extras = extras;
    d.coches = Object.assign({}, remote.coches || {}, d.coches || {});
  }

  async function run() {
    if (!S().ready || !enabled()) return;
    if (running) { again = true; return; }
    running = true;
    emit({ state: 'sync' });
    const c = cfg();
    c.ver = c.ver || {};
    let changed = false;
    const d = S().data;
    const saveQuiet = () => S().save({ quiet: true });
    try {
      /* ----- Recettes ----- */
      const list = (await gh(file(DIR + 'recettes'), { allow404: true })) || [];
      const remote = new Map((Array.isArray(list) ? list : []).filter(f => f.type === 'file' && f.name.endsWith('.json')).map(f => [f.name.slice(0, -5), f.sha]));
      const local = new Map(d.recettes.map(r => [r.id, r]));
      const ids = new Set([...remote.keys(), ...local.keys(), ...Object.keys(c.ver)]);
      const now = Date.now();
      for (const id of ids) {
        const r = local.get(id), rsha = remote.get(id), v = c.ver[id];
        const localDirty = !!r && (!v || v.mod !== r.modifieLe);
        const remoteChanged = !!rsha && (!v || v.sha !== rsha);
        const path = `${DIR}recettes/${id}.json`;
        const label = r ? r.titre : id;
        try {
          if (r && !rsha) {
            if (v && !localDirty) {
              // supprimée depuis un autre téléphone
              if (now - (v.at || 0) < SAFE_DELETE_DELAY()) continue;
              d.recettes = d.recettes.filter(x => x.id !== id);
              delete c.ver[id]; changed = true;
            } else {
              const sha = await put(path, JSON.stringify(r, null, 1), undefined, `Ajout : ${label}`);
              c.ver[id] = { sha, mod: r.modifieLe, at: Date.now() };
            }
          } else if (!r && rsha) {
            if (v && v.sha === rsha) {
              // supprimée sur ce téléphone
              await gh(file(path), { method: 'DELETE', body: { message: `Suppression : ${v.titre || id}`, sha: rsha } });
              delete c.ver[id];
            } else {
              const rr = JSON.parse(await gh(file(path), { raw: true }));
              d.recettes.push(rr);
              c.ver[id] = { sha: rsha, mod: rr.modifieLe, at: Date.now(), titre: rr.titre };
              changed = true;
            }
          } else if (r && rsha) {
            if (remoteChanged) {
              const rr = JSON.parse(await gh(file(path), { raw: true }));
              if (localDirty && (r.modifieLe || '') > (rr.modifieLe || '')) {
                const sha = await put(path, JSON.stringify(r, null, 1), rsha, `Modification : ${label}`);
                c.ver[id] = { sha, mod: r.modifieLe, at: Date.now(), titre: r.titre };
              } else {
                d.recettes[d.recettes.findIndex(x => x.id === id)] = rr;
                c.ver[id] = { sha: rsha, mod: rr.modifieLe, at: Date.now(), titre: rr.titre };
                changed = true;
              }
            } else if (localDirty) {
              const sha = await put(path, JSON.stringify(r, null, 1), rsha, `Modification : ${label}`);
              c.ver[id] = { sha, mod: r.modifieLe, at: Date.now(), titre: r.titre };
            } else if (v && !v.titre) v.titre = r.titre;
          } else {
            delete c.ver[id];
          }
        } catch (e) {
          if (e.status === 409 || e.status === 422) { again = true; continue; } // quelqu'un a écrit en même temps
          throw e;
        }
        saveQuiet();
      }
      if (changed) d.recettes.sort((a, b) => String(b.creeLe || '').localeCompare(String(a.creeLe || '')));

      /* ----- Catalogue public (toutes les recettes dans un seul fichier, lu par le site) ----- */
      const catSnap = d.recettes.map(r => r.id + '@' + r.modifieLe).join('|');
      if (!c.catalogue || c.catalogue.snap !== catSnap) {
        const cur = await gh(file(DIR + 'catalogue.json'), { allow404: true });
        const recettes = d.recettes.map(r => { const x = Object.assign({}, r); delete x.texteBrut; delete x.partagee; return x; });
        try {
          const sha = await put(DIR + 'catalogue.json', JSON.stringify({ majLe: new Date().toISOString(), recettes }), cur && cur.sha, `Catalogue : ${recettes.length} recette${recettes.length > 1 ? 's' : ''}`);
          c.catalogue = { sha, snap: catSnap };
        } catch (e) {
          if (e.status === 409 || e.status === 422) again = true; else throw e;
        }
        saveQuiet();
      }

      /* ----- Semaine, courses, réglages ----- */
      const sem = await gh(file(DIR + 'semaine.json'), { allow404: true });
      const sv = c.semaine || null;
      const before = snapOf(shared());
      const localDirty = !sv || sv.snap !== before;
      if (sem && (!sv || sv.sha !== sem.sha)) {
        const txt = sem.content ? b64decode(sem.content) : await gh(file(DIR + 'semaine.json'), { raw: true });
        const rem = JSON.parse(txt);
        if (localDirty) mergeShared(rem);
        else { d.plan = rem.plan || {}; d.extras = rem.extras || {}; d.coches = rem.coches || {}; if (rem.reglages) d.reglages = Object.assign(d.reglages, rem.reglages); }
        changed = changed || snapOf(shared()) !== before;
      }
      const after = snapOf(shared());
      if (!sem || localDirty) {
        if (!sem || after !== (sv && sv.snap)) {
          try {
            const sha = await put(DIR + 'semaine.json', JSON.stringify(shared(), null, 1), sem && sem.sha, 'Mise à jour de la semaine');
            c.semaine = { sha, snap: after };
          } catch (e) {
            if (e.status === 409 || e.status === 422) again = true; else throw e;
          }
        } else c.semaine = { sha: sem.sha, snap: after };
      } else c.semaine = { sha: sem.sha, snap: after };

      c.last = new Date().toISOString();
      c.error = null;
    } catch (e) {
      console.warn('Synchro', e);
      c.error = e.message;
    } finally {
      running = false;
      saveQuiet();
      emit({ state: c.error ? 'error' : 'done', changed, error: c.error });
      if (again) { again = false; schedule(1500); }
    }
  }

  // Visiteurs (sans jeton) : on charge les recettes partagées publiées sur le site
  async function loadCatalogue() {
    if (!S().ready || enabled()) return false;
    let cat;
    try {
      const res = await fetch(DIR + 'catalogue.json', { cache: 'no-cache' });
      if (!res.ok) return false;
      cat = await res.json();
    } catch (e) { return false; }
    const d = S().data;
    const pub = new Map((cat.recettes || []).map(r => [r.id, r]));
    let changed = false;
    // retire les recettes partagées qui ne sont plus publiées (sauf si le visiteur les a modifiées)
    const before = d.recettes.length;
    d.recettes = d.recettes.filter(r => !r.partagee || pub.has(r.id));
    if (d.recettes.length !== before) changed = true;
    for (const [id, r] of pub) {
      const i = d.recettes.findIndex(x => x.id === id);
      const copy = Object.assign({}, r, { partagee: true });
      if (i < 0) { d.recettes.push(copy); changed = true; }
      else if (d.recettes[i].partagee && d.recettes[i].modifieLe !== r.modifieLe) { d.recettes[i] = copy; changed = true; }
    }
    if (changed) {
      d.recettes.sort((a, b) => String(b.creeLe || '').localeCompare(String(a.creeLe || '')));
      S().save({ quiet: true });
      emit({ state: 'done', changed: true });
    }
    return changed;
  }

  function schedule(delay = 2500) {
    if (!enabled()) { clearTimeout(timer); timer = setTimeout(loadCatalogue, delay); return; }
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  function parseRepo(txt) {
    const m = String(txt || '').trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  // Vérifie le dépôt et le jeton, puis active la synchro
  async function connect(repoTxt, token) {
    const rp = parseRepo(repoTxt);
    if (!rp) throw new Error('Écris le dépôt sous la forme « pseudo/nom-du-depot ».');
    token = String(token || '').trim();
    if (!token) throw new Error('Colle ton jeton GitHub.');
    const c = { owner: rp.owner, repo: rp.repo, token };
    const info = await gh(repoPath(c), {}, c);
    // test d'écriture : lecture d'un fichier qui n'existe pas (vérifie le droit Contents) — l'écriture est testée à la 1re synchro
    await gh(`${repoPath(c)}/contents/${DIR}semaine.json`, { allow404: true }, c);
    S().data.sync = Object.assign(c, { ver: {}, semaine: null, last: null, error: null, prive: !!info.private, nom: info.full_name });
    S().save({ quiet: true });
    await run();
    return { prive: !!info.private, nom: info.full_name, error: cfg().error };
  }
  function disconnect() { delete S().data.sync; S().save({ quiet: true }); emit({ state: 'off' }); }

  function status() {
    const c = cfg();
    if (!enabled()) return { on: false };
    return { on: true, running, nom: c.nom || `${c.owner}/${c.repo}`, prive: c.prive, last: c.last, error: c.error };
  }

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); });
    window.addEventListener('online', () => schedule(300));
  }

  root.Sync = { run, schedule, connect, disconnect, status, loadCatalogue, on: (f) => listeners.push(f), parseRepo };
})(this);

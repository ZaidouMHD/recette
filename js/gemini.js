// Lecture des fiches par l'IA de Google (Gemini), avec une clé gratuite de Google AI Studio.
// La clé reste dans le téléphone : elle n'est ni synchronisée sur GitHub ni exportée.
(function (root) {
  const API = 'https://generativelanguage.googleapis.com/v1beta';
  const S = () => root.Store;
  const cfg = () => S().data.gemini || null;
  const enabled = () => !!(cfg() && cfg().key);

  function errMsg(status, msg) {
    msg = msg || '';
    if (status === 429 || /quota|exhausted|rate/i.test(msg)) return "Limite gratuite de l'IA Google atteinte pour le moment. Réessaie plus tard.";
    if (status === 400 && /api key|API_KEY/i.test(msg)) return 'Clé Google invalide. Vérifie que tu as copié toute la clé.';
    if (status === 403) return "Cette clé Google n'a pas accès à l'IA Gemini.";
    if (status === 404) return "Modèle d'IA introuvable.";
    return `Erreur de l'IA Google (${status})${msg ? ' : ' + msg : ''}`;
  }
  async function call(path, opts = {}, key = cfg().key) {
    let res;
    try {
      res = await fetch(`${API}/${path}`, {
        method: opts.body ? 'POST' : 'GET',
        headers: Object.assign({ 'x-goog-api-key': key }, opts.body ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) { const err = new Error('Pas de connexion Internet.'); err.offline = true; throw err; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(errMsg(res.status, data.error && data.error.message)); e.status = res.status; throw e; }
    return data;
  }

  // Choisit automatiquement le meilleur modèle « Flash » disponible (rapide et gratuit)
  async function pickModels(key) {
    const data = await call('models?pageSize=200', {}, key);
    const ok = (data.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
    const ver = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const stable = ok.filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
    const latest = ok.filter(n => n === 'gemini-flash-latest');
    const others = ok.filter(n => /flash/.test(n) && !/lite|image|tts|audio|live|embed|thinking|exp/.test(n) && !stable.includes(n) && !latest.includes(n)).sort((a, b) => ver(b) - ver(a));
    const list = [...stable, ...latest, ...others];
    if (!list.length) throw new Error("Aucun modèle d'IA Gemini disponible avec cette clé.");
    return list.slice(0, 4);
  }

  async function connect(key) {
    key = String(key || '').trim();
    if (!/^AIza[\w-]{20,}$/.test(key)) throw new Error('La clé Google commence par « AIza… ». Copie-la en entier.');
    const models = await pickModels(key);
    S().data.gemini = { key, models, ajouteLe: new Date().toISOString() };
    S().save({ quiet: true });
    return models[0];
  }
  function disconnect() { delete S().data.gemini; S().save({ quiet: true }); }

  // Photo -> JPEG base64 (réduite pour aller vite et économiser le quota)
  function toJpeg(img, max = 1600) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }
  // Vignette recadrée sur la photo du plat (boîte donnée par l'IA, coordonnées 0–1000)
  function cropThumb(img, box, max = 480) {
    let [y0, x0, y1, x1] = (box || [0, 0, 1000, 1000]).map(Number);
    if (![y0, x0, y1, x1].every(v => v >= 0 && v <= 1000) || y1 - y0 < 100 || x1 - x0 < 100) { y0 = 0; x0 = 0; y1 = 1000; x1 = 1000; }
    const W = img.naturalWidth, H = img.naturalHeight;
    const sx = x0 / 1000 * W, sy = y0 / 1000 * H, sw = (x1 - x0) / 1000 * W, sh = (y1 - y0) / 1000 * H;
    const s = Math.min(1, max / sw);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * s); c.height = Math.round(sh * s);
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  const RAYONS = ['Fruits & légumes', 'Herbes & épices', 'Viandes & poissons', 'Crèmerie & œufs', 'Épicerie salée', 'Épicerie sucrée', 'Boulangerie', 'Surgelés', 'Boissons', 'Autres'];
  const SCHEMA = {
    type: 'OBJECT',
    properties: {
      titre: { type: 'STRING' },
      source: { type: 'STRING', description: 'Marque ou auteur de la fiche (ex. Quitoque, HelloFresh), vide si inconnu' },
      portions: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Nombres de personnes des colonnes du tableau, ex. [2,3,4,5,6], ou [4] si une seule valeur' },
      temps_cuisine: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Minutes en cuisine, une valeur par portion' },
      temps_total: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Minutes avant de passer à table, une valeur par portion (1h05 = 65)' },
      kcal: { type: 'INTEGER', nullable: true },
      tags: { type: 'ARRAY', items: { type: 'STRING' } },
      ingredients: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            nom: { type: 'STRING', description: 'En minuscules, sans l\'unité, ex. « haut de cuisse de poulet »' },
            unite: { type: 'STRING', description: 'g, kg, ml, cl, l, cm, càs, càc, botte, cube… ou vide' },
            q: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Une quantité par portion, dans le même ordre ; nombres avec un point (0.5) ; texte gardé tel quel (« qq brins », « 1 à 3 ») ; "" si non précisé' },
            rayon: { type: 'STRING', enum: RAYONS },
            placard: { type: 'BOOLEAN', description: 'true pour ce qui est « dans votre placard » (sel, poivre, huile, et les lignes sous ce titre)' },
          },
          required: ['nom', 'unite', 'q', 'rayon', 'placard'],
        },
      },
      etapes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            titre: { type: 'STRING', description: 'Titre de la partie, ex. « La garniture », en minuscules sauf la 1re lettre' },
            lignes: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Une étape par puce, texte complet ; les astuces commencent par « Astuce : »' },
          },
          required: ['titre', 'lignes'],
        },
      },
      ustensiles: { type: 'STRING' },
      astuce: { type: 'STRING', description: 'Le petit mot des chefs / conseil de la fiche (pas les renvois vers un QR code)' },
      photo_plat: {
        type: 'OBJECT', nullable: true,
        description: 'Où se trouve la photo du plat',
        properties: {
          image: { type: 'INTEGER', description: 'Index de la photo (0 = première)' },
          boite: { type: 'ARRAY', items: { type: 'INTEGER' }, description: '[ymin, xmin, ymax, xmax] de 0 à 1000, seulement le plat, sans le texte' },
        },
      },
    },
    required: ['titre', 'portions', 'ingredients', 'etapes'],
  };
  const PROMPT = `Tu lis les photos d'une fiche recette (souvent recto et verso de la même fiche).
Retranscris la recette fidèlement, en français, en corrigeant seulement les mots coupés par un trou de perforation ou un reflet.
- Titre : en minuscules sauf la première lettre et les noms propres.
- Ingrédients : une ligne par ingrédient du tableau, avec une quantité par colonne de personnes, dans l'ordre des colonnes. Les éléments listés « Dans votre placard » ont placard=true (sans quantité s'il n'y en a pas).
- Étapes : garde chaque partie numérotée (titre sans le numéro) et chaque puce comme une étape, texte complet.
- N'invente rien : laisse vide ce qui n'est pas sur la fiche.`;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible')); };
      img.src = url;
    });
  }

  async function scan(files, onProgress) {
    const say = (t, f) => onProgress && onProgress(t, f);
    const c = cfg();
    say('Préparation des photos…', 0.1);
    const imgs = [];
    for (const f of files) imgs.push(await loadImage(f));
    const parts = [{ text: PROMPT }];
    imgs.forEach((img, i) => { parts.push({ text: `Photo ${i}` }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: toJpeg(img) } }); });
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 },
    };
    let data, lastErr;
    const models = (c.models && c.models.length) ? c.models : ['gemini-flash-latest'];
    for (let i = 0; i < models.length; i++) {
      say(`Lecture de la fiche par l'IA Google…`, 0.3 + i * 0.1);
      try { data = await call(`models/${models[i]}:generateContent`, { body }); break; }
      catch (e) { lastErr = e; if (e.offline || e.status === 400 || e.status === 403) break; } // 404/429/5xx : on essaie le modèle suivant
    }
    if (!data) throw lastErr || new Error("L'IA Google n'a pas répondu.");
    say('Mise en forme de la recette…', 0.9);
    const cand = (data.candidates || [])[0];
    const txt = cand && cand.content && (cand.content.parts || []).map(p => p.text || '').join('');
    if (!txt) throw new Error("L'IA Google n'a pas pu lire la fiche.");
    const g = JSON.parse(txt);
    return normalize(g, imgs);
  }

  // Remet la réponse au format de l'app
  function normalize(g, imgs) {
    const portions = (g.portions || []).map(Number).filter(n => n > 0);
    const P = portions.length ? portions : [2];
    const fit = (a) => { a = (a || []).map(Number).filter(n => !isNaN(n)); return a.length >= P.length ? a.slice(0, P.length) : a; };
    const ingredients = (g.ingredients || []).filter(i => i && i.nom).map(i => {
      let q = (i.q || []).map(v => { const s = String(v == null ? '' : v).trim(); const n = root.RecipeParser.toNumber(s); return n != null ? n : s; });
      while (q.length < P.length) q.push(q.length && typeof q[0] === 'number' ? Math.round(q[0] * P[q.length] / P[0] * 10) / 10 : (q[0] || ''));
      q = q.slice(0, P.length);
      let rayon = i.rayon;
      if (!rayon || rayon === 'Autres') { const m = root.IngredientsDB.match(i.nom); if (m) rayon = m.entry.rayon; }
      return { nom: String(i.nom).trim(), unite: (i.unite || '').trim(), q, rayon: rayon || 'Autres', placard: !!i.placard };
    });
    const etapes = (g.etapes || []).map(e => ({ titre: (e.titre || '').trim(), lignes: (e.lignes || []).map(l => String(l).trim()).filter(Boolean) })).filter(e => e.lignes.length);
    const pp = g.photo_plat;
    const idx = pp && imgs[pp.image] ? pp.image : 0;
    return {
      titre: (g.titre || '').trim(),
      source: (g.source || '').trim(),
      portions: P,
      temps: { cuisine: fit(g.temps_cuisine), total: fit(g.temps_total) },
      kcal: g.kcal || null,
      tags: (g.tags || []).filter(Boolean).slice(0, 4),
      ingredients, etapes,
      ustensiles: (g.ustensiles || '').trim(),
      astuce: (g.astuce || '').trim(),
      photo: imgs.length ? cropThumb(imgs[idx], pp && pp.boite) : null,
      lu: 'ia',
    };
  }

  root.Gemini = { enabled, connect, disconnect, scan, status: () => (enabled() ? { on: true, model: (cfg().models || [])[0] } : { on: false }) };
})(this);

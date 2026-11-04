// Analyseur de recettes : transforme le texte lu par l'OCR en recette structurée.
// Fonctionne sans aucun service externe. Entrée : pages = [{ lines: [{ text, h, conf }] }]
(function (root) {
  const DB = (typeof module !== 'undefined' && module.exports) ? require('./ingredients-db.js') : root.IngredientsDB;
  const { norm } = DB;

  const MARK = {
    ingredients: /^(ingredients?|ingredient|liste des ingredients|il vous faut)\b/,
    etapes: /^(etapes?( de la recette)?|preparation|instructions|deroulement|la recette)\b/,
    ustensiles: /^(ustensiles?|materiel)\b/,
    astuce: /^(astuces?|conseils?|le petit mot des chefs|le mot du chef|bon a savoir)\b/,
    meta: /^(en cuisine|a table|pour$|pour \d|priorite|naturellement|environ|\d+ additifs|exclus|nos recettes|\d+ min|\d+ pers)/,
    stop: /^(cas ?=|c\.?a\.?s\b|1 cas\b|nutri|score|scannez|flyer|pefc|retrouvez|bon appetit|ce qr code)/,
  };

  function clean(t) {
    return (t || '').replace(/[’‘`´]/g, "'").replace(/[“”«»]/g, '"').replace(/\s+/g, ' ').trim();
  }
  function letters(t) { return (t.match(/[A-Za-zÀ-ÿœŒ]/g) || []).length; }
  function plain(t) { return norm(t).replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sectionOf(t) {
    const p = plain(t);
    for (const k of ['ingredients', 'etapes', 'ustensiles', 'astuce', 'stop']) if (MARK[k].test(p)) return k;
    return null;
  }
  function sentence(t) {
    const s = t.toLowerCase().replace(/\s+/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // Enlève les petits débris de lecture en début et fin de ligne ("e ", "« ", " {", " A")
  function trimNoise(t) {
    let s = clean(t);
    // puces et débris au début
    for (let i = 0; i < 4; i++) {
      const before = s;
      s = s.replace(/^[^\wÀ-ÿœŒ0-9]+/, '');
      s = s.replace(/^(?:[a-zë]{1,2}|[A-ZÆË])\s+(?=[A-ZÀ-Ý0-9])/, ''); // "e Coupez", "el e Hachez", "Æ 2."
      s = s.replace(/^[es](?=[A-ZÀ-Ý][a-zà-ÿ])/, ''); // "ePréchauffez"
      if (s === before) break;
    }
    // débris à la fin
    for (let i = 0; i < 3; i++) {
      const before = s;
      s = s.replace(/\s+[^\wÀ-ÿ.!?)%°]+$/, '').replace(/(\S)\s+([A-Za-z])$/, (m, a, b) => (/\d/.test(a) ? m : /[.!?,;)]/.test(a) ? a : /[yaA]/.test(b) ? m : a)).replace(/[^\wÀ-ÿ.!?)%°]+$/, '');
      if (s === before) break;
    }
    return s.trim();
  }

  /* ---------- Titre ---------- */
  function findTitle(pages) {
    let best = null;
    const cands = [];
    pages.forEach((p, pi) => p.lines.forEach((l, li) => {
      const t = clean(l.text);
      if ((l.conf || 0) < 55 || t.length < 3) return;
      if (letters(t) / t.replace(/\s/g, '').length < 0.75) return;
      if (sectionOf(t)) return;
      if (/[.!?,;]$/.test(t) || t.split(/\s+/).length > 7) return;
      cands.push({ pi, li, h: (l.h || 0) * (t === t.toUpperCase() ? 1.15 : 1), t });
    }));
    for (const c of cands) if (!best || c.h > best.h) best = c;
    if (!best) return '';
    // lignes voisines de taille comparable = suite du titre
    const page = pages[best.pi].lines;
    const pick = (i) => {
      const l = page[i]; if (!l) return null;
      const t = clean(l.text);
      if ((l.conf || 0) < 50 || sectionOf(t) || letters(t) < 2) return null;
      return (l.h || 0) >= best.h * 0.35 && (l.h || 0) <= best.h * 1.6 ? t : null;
    };
    const parts = [best.t];
    for (let i = best.li - 1; i >= 0 && best.li - i <= 4; i--) { const t = pick(i); if (!t) break; parts.unshift(t); }
    for (let i = best.li + 1; i < page.length && i - best.li <= 5; i++) { const t = pick(i); if (!t) break; parts.push(t); }
    let title = parts.map(p => p.replace(/^[^A-Za-zÀ-ÿ]*[BE8®]?E\s+(?=[A-ZÀ-Ý]{3})/, 'DE ').replace(/^[^A-Za-zÀ-ÿ]*(?:[A-Za-z](?=\s))?\s*/, '')
      .replace(/^[^A-Za-zÀ-ÿ]+/, '')).join(' ');
    title = title.replace(/[^A-Za-zÀ-ÿœŒ0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
    // trou de perforation / débris fréquent : "BE POULET" -> "DE POULET"
    title = title.replace(/\b[BE8®]E\b(?= [A-ZÀ-Ý])/g, 'DE');
    return sentence(title);
  }

  /* ---------- Quantités ---------- */
  const QTY_WORD = /^(qq|quelques|pincee|une|un|deux|trois|quatre|cinq|six|demi|½|¼|¾)$/i;
  const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10, demi: 0.5 };
  function toNumber(s) {
    if (s == null) return null;
    if (typeof s === 'number') return s;
    const t = String(s).trim().replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : null; }
    if (t === '½') return 0.5; if (t === '¼') return 0.25; if (t === '¾') return 0.75;
    const w = NUM_WORDS[norm(t)]; if (w) return w;
    return null;
  }

  function cleanRowName(name) {
    name = String(name || '').replace(/[”“"']+\s*$/, '').replace(/^[^A-Za-zÀ-ÿœŒ]+/, '').replace(/^(?:\S\s+)+(?=\S{3,})/, '');
    const parts = name.split(/\s+/);
    while (parts.length > 1 && parts[parts.length - 1].replace(/[^A-Za-zÀ-ÿ]/g, '').length <= 2) parts.pop();
    return parts.join(' ').replace(/[^A-Za-zÀ-ÿœŒ)]+$/, '');
  }

  // Ligne d'un tableau multi-portions : "haut de cuisse de poulet (g) 225 | 375 | 450 600 750"
  function parseTableRow(text, N) {
    let t = clean(text).replace(/[|!;:{}\[\]"”“\\]/g, ' ').replace(/(\d)\s*([,.])\s*(\d)/g, '$1$2$3');
    let unit = '';
    const um = t.match(/\(\s*(g|kg|ml|cl|l|cm|gr)\s*\)?/i);
    if (um) { unit = um[1].toLowerCase().replace('gr', 'g'); t = t.replace(um[0], ' '); }
    // "qq brins" répété dans toutes les colonnes
    if ((t.match(/b?rins?\b|brin/gi) || []).length >= 2) {
      const name = t.split(/\s(?=[;:'‘9q]*q?q\s*brin)|(?:[;:'‘])?9?q?q brin/i)[0];
      return { name: cleanRowName(name), qty: Array(N).fill('qq brins'), unit, fixed: false };
    }
    const toks = t.split(/\s+/).filter(Boolean);
    let i = 0;
    const nameT = [];
    while (i < toks.length && !/^\d/.test(toks[i]) && !/^[½¼¾]/.test(toks[i])) nameT.push(toks[i++]);
    const rest = toks.slice(i);
    let fixed = false;
    let q = [];
    const hasRange = rest.some(x => /^\d[aà]\d$/.test(x)) || /\d\s*[aà]\s*\d/.test(rest.join(' '));
    // "1,1" : virgule = séparateur de colonnes si on manque de valeurs, sinon nombre décimal
    const nTok = rest.filter(x => /^\d/.test(x)).length;
    for (let j = 0; j < rest.length; j++) {
      let x = rest[j];
      if (/^[1-9]\d*,\d+$/.test(x) && nTok < N) { x.split(',').forEach(v => q.push(parseFloat(v))); fixed = true; continue; }
      x = x.replace(',', '.');
      if (/^\d[aà]\d$/.test(x)) { q.push(x[0] + ' à ' + x[2]); continue; }
      if (/^\d$/.test(x) && /^[aà]$/.test(rest[j + 1] || '') && /^\d$/.test(rest[j + 2] || '')) { q.push(x + ' à ' + rest[j + 2]); j += 2; continue; }
      if (hasRange && /^\d\d\d$/.test(x) && x[0] < x[2]) { q.push(x[0] + ' à ' + x[2]); fixed = true; continue; }
      if (/^0\d\/0\d$/.test(x)) { x.split('/').forEach(v => q.push(parseFloat('0.' + v[1]))); fixed = true; continue; }
      if (/^0\d$/.test(x)) { q.push(parseFloat('0.' + x[1])); fixed = true; continue; }
      if (/^\d+(\.\d+)?$/.test(x)) { q.push(parseFloat(x)); continue; }
      if (/^\d+\/\d+$/.test(x)) { q.push(toNumber(x)); continue; }
      if (/^[½¼¾]$/.test(x)) { q.push(toNumber(x)); continue; }
      if (/^\d+[a-z]+$/i.test(x)) { const m = x.match(/^(\d+)([a-z]+)$/i); q.push(parseFloat(m[1])); if (!unit && /^(g|kg|ml|cl|cm)$/i.test(m[2])) unit = m[2].toLowerCase(); continue; }
      // jeton "1" ou "l"/"I"/"i" mal lu : ignoré pour l'instant
      q.__amb = (q.__amb || 0) + 1;
    }
    // "21314158" : séparateurs lus comme des 1
    if (q.length === 1 && N > 1) {
      const s = String(rest.find(x => /^\d+$/.test(x)) || '');
      if (s.length === 2 * N - 1 || s.length === 2 * N - 2) {
        q = s.split('').filter((_, k) => k % 2 === 0).map(Number);
        if (s.length === 2 * N - 2) q.push(Number(s[s.length - 1]));
        fixed = true;
      }
    }
    // trop de valeurs : un séparateur lu comme "1" entre de grands nombres
    while (q.length > N) {
      const k = q.findIndex((v, k) => v === 1 && ((q[k + 1] || 0) >= 10 || (q[k - 1] || 0) >= 10));
      if (k < 0) break; q.splice(k, 1); fixed = true;
    }
    // "1171" : deux valeurs et des séparateurs lus comme des chiffres
    if (q.length < N) {
      const nums = q.filter(v => typeof v === 'number');
      const k = q.findIndex(v => typeof v === 'number' && v >= 100 && String(v).length >= 3 && v > 10 * Math.max(...nums.filter(x => x !== v), 1) && nums.length > 2);
      if (k >= 0) { const sv = String(q[k]); q.splice(k, 1, Number(sv[0]), Number(sv[sv.length - 1])); fixed = true; }
    }
    // "11" = deux colonnes collées
    if (q.length < N) {
      const k = q.findIndex(v => v === 11 || v === 22 || v === 33);
      if (k >= 0) { const d = q[k] / 11; q.splice(k, 1, d, d); fixed = true; }
    }
    // il manque la première valeur : souvent un "1" lu comme une lettre ("n", "l", "I")
    // "1.1" au milieu de nombres entiers : un séparateur de colonne lu comme décimale
    if (q.filter(v => typeof v === 'number' && Number.isInteger(v)).length >= q.length - 1) {
      q = q.map(v => {
        if (typeof v !== 'number' || Number.isInteger(v)) return v;
        const f = Math.round((v % 1) * 100) / 100;
        if ([0.5, 0.25, 0.75].includes(f)) return v;
        fixed = true; return Math.floor(v) || v;
      });
    }
    // les quantités augmentent avec le nombre de personnes : corrige 3↔8, 5↔6…
    const SWAP = { 8: [3, 6, 5, 0], 6: [5, 8], 5: [6, 3], 3: [8, 5], 9: [4, 7], 7: [1, 2] };
    for (let k = 0; k < q.length; k++) {
      const v = q[k], prev = k ? q[k - 1] : -Infinity, next = k < q.length - 1 ? q[k + 1] : Infinity;
      if (typeof v !== 'number' || (v >= prev && v <= next)) continue;
      const alt = (SWAP[v] || []).find(a => a >= (typeof prev === 'number' ? prev : -Infinity) && a <= (typeof next === 'number' ? next : Infinity));
      if (alt != null && q.filter(x => typeof x === 'number').length === q.length) { q[k] = alt; fixed = true; }
    }
    let name = nameT.join(' ');
    if (q.length === N - 1 && /\s[nlIi|]$/.test(' ' + name)) { q.unshift(1); fixed = true; }
    return { name: cleanRowName(name), qty: q, unit, fixed };
  }

  const UNITS = [
    ['càs', /^(c\.?\s?à\.?\s?s\.?|càs|cas|cs|c\.s\.|cuill(?:e|è)res?\s+à\s+soupe|cuil\.?\s?à\s?soupe|cuillères? à soupe|cs\.)$/i],
    ['càc', /^(c\.?\s?à\.?\s?c\.?|càc|cac|cc|c\.c\.|cuill(?:e|è)res?\s+à\s+café|cuil\.?\s?à\s?café)$/i],
    ['g', /^(g|gr|grammes?)$/i], ['kg', /^(kg|kilos?)$/i], ['ml', /^(ml)$/i], ['cl', /^(cl)$/i], ['l', /^(l|litres?)$/i],
    ['pincée', /^pinc[ée]es?$/i], ['gousse', /^gousses?$/i], ['tranche', /^tranches?$/i], ['sachet', /^sachets?$/i],
    ['boîte', /^bo[iî]tes?$/i], ['brin', /^brins?$/i], ['botte', /^bottes?$/i], ['verre', /^verres?$/i], ['filet', /^filets?$/i],
    ['bouquet', /^bouquets?$/i], ['tasse', /^tasses?$/i], ['poignée', /^poign[ée]es?$/i], ['cm', /^cm$/i], ['feuille', /^feuilles?$/i],
  ];
  function unitOf(tok) { for (const [u, re] of UNITS) if (re.test(tok)) return u; return null; }

  // Ligne simple : "200 g de farine", "2 c. à soupe d'huile d'olive", "Sel, poivre", "Farine : 200 g"
  function parseSimpleLine(text) {
    let t = trimNoise(text).replace(/^[-•*·]\s*/, '');
    if (!t) return null;
    // "Farine : 200 g"
    let m = t.match(/^(.+?)\s*[:\-–]\s*(\d+(?:[.,]\d+)?)\s*([a-zà-ÿ.]+)?$/i);
    if (m && letters(m[1]) > 2) return { name: m[1], qty: [toNumber(m[2])], unit: (m[3] && unitOf(m[3])) || '' };
    t = t.replace(/(\d)\s*[,.]\s*(\d)/g, '$1.$2').replace(/(\d)(g|kg|ml|cl|l)\b/gi, '$1 $2');
    t = t.replace(/(cuill[eè]res?|cuil\.?|c\.?)\s*à\s*soupe/gi, 'càs').replace(/(cuill[eè]res?|cuil\.?|c\.?)\s*à\s*caf[eé]/gi, 'càc')
      .replace(/\bc\.\s*à\s*s\.?(?![a-z])/gi, 'càs').replace(/\bc\.\s*à\s*c\.?(?![a-z])/gi, 'càc');
    const toks = t.split(/\s+/);
    let qty = null, unit = '', i = 0;
    const n0 = toNumber(toks[0]);
    if (n0 != null) {
      qty = n0; i = 1;
      if (/^[aà]$/.test(toks[1] || '') && toNumber(toks[2]) != null) { qty = toks[0] + ' à ' + toks[2]; i = 3; }
      const u = unitOf(toks[i] || '');
      if (u) { unit = u; i++; }
    }
    let name = toks.slice(i).join(' ').replace(/^(de|d'|des|du)\s*/i, '').replace(/^d'/i, '');
    if (!name || letters(name) < 2) return null;
    return { name, qty: [qty == null ? '' : qty], unit };
  }

  function finishIngredient(raw, N, placard, cols) {
    let name = clean(raw.name).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    let unit = raw.unit || '';
    let verifier = !!raw.fixed;
    const m = DB.match(name);
    let rayon = 'Autres';
    if (m) {
      rayon = m.entry.rayon;
      if (!m.clean) { name = m.entry.nom; verifier = true; }
      const big = raw.qty.some(v => typeof v === 'number' && v >= 20);
      if (!unit && big && m.entry.unite) unit = m.entry.unite;
    }
    if (!name) return null;
    name = name.charAt(0).toLowerCase() + name.slice(1);
    let qty = raw.qty.slice(0, N);
    if (qty.length !== N) verifier = true;
    while (qty.length < N) qty.push(scaleGuess(qty, qty.length, cols));
    // contrôle : valeurs aberrantes ou qui diminuent quand le nombre de personnes augmente
    const nums = qty.filter(v => typeof v === 'number');
    if (nums.some(v => v > 5000) || nums.some((v, k) => k > 0 && v < nums[k - 1])) verifier = true;
    if (placard) rayon = rayon === 'Autres' ? 'Placard' : rayon;
    return { nom: name, unite: unit, q: qty, rayon, placard: !!placard, verifier };
  }
  function scaleGuess(q, idx, cols) {
    const v = q[0];
    if (typeof v !== 'number' || !cols) return v == null ? '' : v;
    return Math.round(v * cols[idx] / cols[0] * 10) / 10;
  }

  function parseIngredients(lines) {
    // Tableau multi-portions ?
    let portions = null;
    let headerIdx = -1;
    lines.forEach((l, i) => {
      const n = (plain(l).match(/\bp[eé]?rs\b|\bpers\b|\bpersonnes?\b|\bpers\.?/g) || []).length;
      if (n >= 2 && headerIdx < 0) { headerIdx = i; portions = n; }
    });
    const out = [];
    let placard = false;
    if (portions) {
      const N = portions;
      // les numéros de colonnes ("2 3 4 5 6") : sur la ligne d'en-tête ou juste au-dessus
      let cols = null;
      for (const j of [headerIdx, headerIdx - 1]) {
        if (j < 0) continue;
        const nums = (lines[j].match(/\d+/g) || []).map(Number).filter(v => v >= 1 && v <= 12);
        if (nums.length === N && nums.every((v, k) => k === 0 || v > nums[k - 1])) { cols = nums; break; }
      }
      if (!cols) cols = Array.from({ length: N }, (_, k) => k + 2); // format courant : 2 à N+1 pers.
      let pending = '';
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const l = lines[i];
        const p = plain(l);
        if (/dans votre placard/.test(p)) {
          placard = true;
          const items = clean(l).split(/:/).slice(1).join(':').split(/[,;]/).map(s => trimNoise(s)).filter(s => letters(s) > 1);
          items.forEach(s => { const ing = finishIngredient({ name: s, qty: Array(N).fill('') }, N, true, cols); if (ing) { ing.verifier = false; out.push(ing); } });
          continue;
        }
        if (/^dans votre box/.test(p)) continue;
        if (/pefc|flyer|certifi|bac de tri|\.org\b|\bcas\s*=/.test(p)) break;
        const row = parseTableRow(l, N);
        if (!row.qty.length) { if (letters(row.name) >= 2) pending = (pending + ' ' + row.name).trim(); continue; }
        if (pending) { row.name = pending + ' ' + row.name; pending = ''; row.fixed = true; }
        if (letters(row.name) < 2) continue;
        const ing = finishIngredient(row, N, placard, cols);
        if (ing) out.push(ing);
      }
      return { portions: cols, ingredients: out };
    }
    // Liste simple
    for (const l of lines) {
      const p = plain(l);
      if (/^(pour|dans votre placard)/.test(p) && !/\d/.test(p)) continue;
      if (/dans votre placard|placard\s*:/.test(p)) {
        clean(l).split(/:/).slice(1).join(':').split(/[,;]/).map(trimNoise).filter(s => letters(s) > 1)
          .forEach(s => { const ing = finishIngredient({ name: s, qty: [''] }, 1, true); if (ing) { ing.verifier = false; out.push(ing); } });
        continue;
      }
      // "sel, poivre" sur une ligne
      if (!/\d/.test(l) && /,/.test(l) && clean(l).split(',').every(s => s.trim().split(' ').length <= 3)) {
        clean(l).split(',').map(trimNoise).filter(s => letters(s) > 1).forEach(s => {
          const ing = finishIngredient({ name: s, qty: [''] }, 1, false); if (ing) out.push(ing);
        });
        continue;
      }
      const r = parseSimpleLine(l);
      if (r) { const ing = finishIngredient(r, 1, false); if (ing) out.push(ing); }
    }
    return { portions: null, ingredients: out };
  }

  /* ---------- Étapes ---------- */
  function parseSteps(lines) {
    const sections = [];
    let cur = null;
    const push = (titre) => { cur = { titre: titre || '', lignes: [] }; sections.push(cur); };
    for (const raw of lines) {
      const t = trimNoise(raw);
      if (!t || letters(t) < 2) continue;
      // Titre de section : "1. LES POMMES DE TERRE"
      const sm = t.match(/^(\d{1,2})\s*[.)\-]?\s*([A-ZÀ-ÝŒ' ,&-]{4,})$/);
      if (sm && letters(sm[2]) >= 3) { push(sentence(sm[2])); continue; }
      if (!cur) push('');
      // Étape numérotée : "1. Faites chauffer..." / "2) ..."
      const nm = t.match(/^(\d{1,2})\s*[.)\-–]\s+(.+)$/);
      let txt = nm ? nm[2] : t;
      txt = txt.replace(/^[•·*\-–]\s*/, '');
      const startsLower = /^[a-zà-ÿ(]/.test(txt);
      const last = cur.lignes[cur.lignes.length - 1];
      if (last && !nm && (startsLower || !/[.!?:)]$/.test(last) && !/^[A-ZÀ-Ý]/.test(txt))) {
        cur.lignes[cur.lignes.length - 1] = (last + ' ' + txt).replace(/\s+/g, ' ');
      } else {
        cur.lignes.push(txt);
      }
    }
    return sections.filter(s => s.lignes.length);
  }

  /* ---------- Méta ---------- */
  function parseMeta(all) {
    const txt = all.join('\n');
    const p = plain(txt);
    const meta = {};
    const kc = txt.match(/(\d{2,4})\s*k\s?cal/i); if (kc) meta.kcal = parseInt(kc[1], 10);
    const pp = p.match(/pour\s+(\d{1,2})\s+(personnes?|pers|parts?)/); if (pp) meta.pour = parseInt(pp[1], 10);
    const prep = p.match(/(?:preparation|en cuisine)\s*:?\s*(\d{1,3})\s*min/); if (prep) meta.prep = parseInt(prep[1], 10);
    const cuis = p.match(/cuisson\s*:?\s*(\d{1,3})\s*min/); if (cuis) meta.cuisson = parseInt(cuis[1], 10);
    // tableau "En cuisine / À table dans" : liste de minutes
    const mins = [];
    all.forEach(l => { const ms = l.match(/(\d{1,3})\s*m[il1]n/gi); if (ms && ms.length <= 3) ms.forEach(x => mins.push(parseInt(x, 10))); });
    meta.minutes = mins;
    if (/sans gluten/.test(p)) meta.tags = ['Sans gluten'];
    if (/qu.?.?toque|quitoque|\btoque\b/.test(p)) meta.source = 'Quitoque';
    else if (/hello ?fresh/.test(p)) meta.source = 'HelloFresh';
    return meta;
  }


  /* ---------- Reconstruction par position (tableaux, colonnes) ---------- */
  // Regroupe des mots en lignes selon leur hauteur sur la photo, puis les trie de gauche à droite.
  function rowsOf(words) {
    const ws = words.slice().sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const rows = [];
    for (const w of ws) {
      const cy = (w.y0 + w.y1) / 2, h = w.y1 - w.y0;
      const r = rows.find(r => Math.abs(r.cy - cy) < Math.max(6, Math.min(r.h, h) * 0.55));
      if (r) { r.ws.push(w); r.cy = (r.cy * (r.ws.length - 1) + cy) / r.ws.length; }
      else rows.push({ cy, h, ws: [w] });
    }
    rows.sort((a, b) => a.cy - b.cy);
    return rows.map(r => r.ws.sort((a, b) => a.x0 - b.x0).map(w => w.t).join(' ').trim()).filter(Boolean);
  }
  const HDR = {
    ingredients: /^ingredients?$/,
    ustensiles: /^(ustensiles?|materiel)$/,
    astuce: /^(astuces?|conseils?)$/,
    etapes: /^(etapes?|preparation)$/,
  };
  const STOPW = /^(cas|c\.a\.s|flyer|pefc|scannez|nutri-score|nutri)$/;
  function wordRegions(page) {
    const W = (page.words || []).filter(w => w.t && w.t.trim());
    if (!W.length) return {};
    const nw = (w) => plain(w.t).replace(/[^a-z-.]/g, '');
    const heads = [];
    W.forEach(w => { for (const k of Object.keys(HDR)) if (HDR[k].test(nw(w)) && (w.conf || 0) > 40) heads.push({ k, w }); });
    const out = {};
    for (const { k, w: H } of heads) {
      if (k === 'etapes' || out[k]) continue;
      const hh = H.y1 - H.y0;
      const left = Math.max(0, H.x0 - 2 * hh);
      // bord droit : un autre titre de section sur la même bande, à droite
      let right = page.width || 1e9;
      for (const o of heads) {
        if (o.w === H) continue;
        const oy = (o.w.y0 + o.w.y1) / 2;
        if (o.w.x0 > H.x1 && Math.abs(oy - (H.y0 + H.y1) / 2) < 3 * hh) right = Math.min(right, o.w.x0 - hh * 0.5);
      }
      // bas : prochain titre ou mot d'arrêt dans la même colonne
      let bottom = page.height || 1e9;
      for (const o of W) {
        if (o.y0 <= H.y1) continue;
        const overlaps = o.x1 > left && o.x0 < right;
        if (!overlaps) continue;
        const n = nw(o);
        const isHead = Object.values(HDR).some(re => re.test(n)) && (o.y1 - o.y0) > hh * 0.6;
        if (isHead || STOPW.test(n)) bottom = Math.min(bottom, o.y0 - 2);
      }
      const inside = W.filter(o => o !== H && o.y0 > H.y1 - hh * 0.2 && o.y1 < bottom + 4 && (o.x0 + o.x1) / 2 > left && (o.x0 + o.x1) / 2 < right && (o.conf || 0) > 20);
      out[k] = rowsOf(inside);
      const r = Math.min(right, page.width || right), b = Math.min(bottom, page.height || bottom);
      out[k].rect = { left: Math.round(left), top: Math.round(H.y1 + 2), width: Math.round(r - left), height: Math.round(b - H.y1 - 2) };
    }
    return out;
  }
  // Zones à relire en mode « tableau » (2e passage de l'OCR)
  function regionRects(page) {
    const r = wordRegions(page), out = {};
    if (r.ingredients && r.ingredients.rect.width > 50 && r.ingredients.rect.height > 50) out.ingredients = r.ingredients.rect;
    return out;
  }
  function ingKey(nom) { const m = DB.match(nom); return m ? DB.key(m.entry.nom) : DB.key(nom); }
  function goodCount(res) { return res.ingredients.filter(i => !i.verifier && i.q.some(v => v !== '')).length + res.ingredients.length * 0.1; }
  // Fusionne plusieurs lectures d'un même tableau : la meilleure sert de base, les autres complètent
  function mergeIngredients(results) {
    results = results.filter(r => r.ingredients.length);
    if (!results.length) return { portions: null, ingredients: [] };
    results.sort((a, b) => goodCount(b) - goodCount(a));
    const base = results[0];
    const N = (base.portions || [0]).length;
    const list = base.ingredients.slice();
    for (const other of results.slice(1)) {
      if ((other.portions || [0]).length !== N) continue;
      const have = new Map(list.map((i, k) => [ingKey(i.nom), k]));
      let lastIdx = -1;
      for (const ing of other.ingredients) {
        const k = ingKey(ing.nom);
        if (have.has(k)) {
          const j = have.get(k);
          lastIdx = j;
          if (list[j].verifier && !ing.verifier) list[j] = ing; // lecture plus sûre
          continue;
        }
        if (ing.verifier && !DB.match(ing.nom)) continue; // ligne douteuse et inconnue : on ignore
        list.splice(lastIdx + 1, 0, ing); lastIdx++;
        have.clear(); list.forEach((i, x) => have.set(ingKey(i.nom), x));
      }
    }
    return { portions: base.portions, ingredients: list };
  }

  function parse(pages) {
    const all = [];
    pages.forEach(p => p.lines.forEach(l => {
      if ((l.conf || 0) < 40) return;
      const t = clean(l.text);
      if (!t || (letters(t) < 2 && !/\d/.test(t))) return;
      all.push(t);
    }));
    // découpe en blocs selon les titres de section
    const blocks = { intro: [], ingredients: [], etapes: [], ustensiles: [], astuce: [], mot: [] };
    let curK = 'intro';
    for (const t of all) {
      const s = sectionOf(trimNoise(t)) || sectionOf(t);
      if (s === 'stop') { curK = 'stop'; continue; }
      if ((curK === 'astuce' || curK === 'mot') && MARK.meta.test(plain(t))) { curK = 'intro'; blocks.intro.push(t); continue; }
      if (s) {
        curK = (s === 'astuce' && /petit mot|mot du chef/.test(plain(t))) ? 'mot' : s;
        // contenu sur la même ligne : "Ustensiles : four, poêle"
        const after = t.split(/:\s*/).slice(1).join(': ').trim();
        if (after && s !== 'etapes') blocks[curK].push(after);
        continue;
      }
      if (curK === 'stop') continue;
      blocks[curK].push(t);
    }
    // Les zones reconstruites par position sont plus fiables que le découpage du moteur
    const reg = { ingredients: [], ustensiles: [], astuce: [] };
    pages.forEach(p => { const r = wordRegions(p); for (const k of Object.keys(reg)) if (r[k]) reg[k] = reg[k].concat(r[k]); });
    const zone = [];
    pages.forEach(p => { if (p.zones && p.zones.ingredients) zone.push(...p.zones.ingredients); });
    const ingCands = [];
    if (zone.length >= 2) ingCands.push(zone);
    if (reg.ingredients.length >= 2) ingCands.push(reg.ingredients);
    if (reg.ustensiles.length) blocks.ustensiles = reg.ustensiles;
    if (reg.astuce.length) blocks.astuce = reg.astuce;
    // une « astuce » qui renvoie vers un QR code n'est pas utile sans le code
    if (/qr ?code|scannez/i.test(blocks.astuce.join(' '))) blocks.astuce = [];
    blocks.astuce = blocks.mot.concat(blocks.astuce);
    // Pas de titre "Ingrédients" trouvé : on repère les lignes qui commencent par une quantité
    if (!blocks.ingredients.length) {
      const src = blocks.intro.concat(blocks.etapes.length ? [] : []);
      blocks.ingredients = src.filter(l => /^\s*(\d+(?:[.,]\d+)?|½|¼)\s*(g|kg|ml|cl|l|c|cuill|pinc|gousse|tranche|sachet)?\b/i.test(l) && letters(l) > 3);
    }
    ingCands.push(blocks.ingredients);
    const ing = mergeIngredients(ingCands.map(parseIngredients));
    const meta = parseMeta(all);
    let portions = ing.portions || [meta.pour || 2];
    const N = portions.length;
    // temps : "En cuisine" et "À table dans" pour chaque portion
    let temps = { cuisine: [], total: [] };
    if (N > 1 && meta.minutes.length >= 2 * N) {
      temps.cuisine = meta.minutes.slice(0, N);
      temps.total = meta.minutes.slice(N, 2 * N);
      if (temps.total[0] < temps.cuisine[0]) { const x = temps.cuisine; temps.cuisine = temps.total; temps.total = x; }
    } else if (meta.prep || meta.cuisson) {
      temps.cuisine = [meta.prep || 0];
      temps.total = [(meta.prep || 0) + (meta.cuisson || 0)];
    } else if (meta.minutes.length) {
      temps.cuisine = [meta.minutes[0]];
      temps.total = [meta.minutes[1] || meta.minutes[0]];
    }
    // "Le petit mot des chefs" (dans l'intro) = astuce
    const astuce = blocks.astuce.map(trimNoise).filter(x => (x.match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length >= 3).join(' ').replace(/\s+/g, ' ').trim();
    const ustensiles = blocks.ustensiles.map(trimNoise).filter(x => letters(x) > 2).join(' ')
      .replace(/\s+/g, ' ').replace(/\s+a$/, '').trim();
    return {
      titre: findTitle(pages) || '',
      source: meta.source || '',
      portions,
      temps,
      kcal: meta.kcal || null,
      tags: meta.tags || [],
      ingredients: ing.ingredients,
      etapes: parseSteps(blocks.etapes),
      ustensiles,
      astuce,
      texteBrut: pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n\n— page suivante —\n\n'),
    };
  }

  const api = { parse, parseSimpleLine, parseTableRow, toNumber, trimNoise, regionRects };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecipeParser = api;
})(this);

/* Recette — application principale */
(function () {
  const S = Store;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $('#app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const REPAS = { midi: 'Midi', soir: 'Soir' };

  /* ---------- Dates ---------- */
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const k = (x.getDay() + 6) % 7; return addDays(x, -k); }
  const fmtDay = (d) => `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  let weekStart = mondayOf(new Date());
  const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekKey = () => iso(weekStart);

  /* ---------- Quantités ---------- */
  function idxFor(portions, n) {
    let best = 0, bd = Infinity;
    portions.forEach((p, k) => { const dd = Math.abs(p - n); if (dd < bd) { bd = dd; best = k; } });
    return best;
  }
  function qtyFor(ing, n, portions) {
    const i = portions.indexOf(n);
    if (i >= 0 && ing.q[i] !== '' && ing.q[i] != null) return ing.q[i];
    let best = -1, bd = Infinity;
    portions.forEach((p, k) => { if (typeof ing.q[k] === 'number' && Math.abs(p - n) < bd) { bd = Math.abs(p - n); best = k; } });
    if (best < 0) return ing.q.find(v => v !== '' && v != null) || '';
    return ing.q[best] * n / portions[best];
  }
  function fmtNum(v, unite) {
    if (typeof v !== 'number') return v || '';
    if (['g', 'ml'].includes(unite) && v >= 20) return String(Math.round(v / 5) * 5);
    const ent = Math.floor(v + 1e-9), frac = v - ent;
    const F = [[0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.66, '⅔'], [0.75, '¾']];
    for (const [f, s] of F) if (Math.abs(frac - f) < 0.04) return ent ? `${ent} ${s}` : s;
    if (frac < 0.04) return String(ent);
    if (frac > 0.96) return String(ent + 1);
    return String(Math.round(v * 10) / 10).replace('.', ',');
  }
  function fmtQty(v, unite) {
    const n = fmtNum(v, unite);
    if (n === '' || n == null) return '';
    return unite ? `${n} ${unite}` : n;
  }
  function timeFor(r, n) {
    const t = r.temps || {};
    const i = idxFor(r.portions || [2], n);
    const pick = (a) => (a && a.length ? (a[i] != null ? a[i] : a[a.length - 1]) : null);
    return { cuisine: pick(t.cuisine), total: pick(t.total) };
  }
  const defaultPers = (r) => {
    const p = S.data.reglages.pers || 2;
    return p;
  };

  /* ---------- Toast / feuille modale ---------- */
  let toastTimer;
  function toast(msg) {
    let t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function sheet(html, onMount) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip-zone" aria-label="Fermer" role="button"><div class="sheet-grip"></div></div><button class="sheet-x icon-btn" data-close aria-label="Fermer">${I.x}</button>${html}</div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const sh = wrap.querySelector('.sheet');
    const close = () => { sh.style.transition = ''; sh.style.transform = ''; wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 220); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    // Glisser le petit trait vers le bas (ou le toucher) pour fermer
    const zone = wrap.querySelector('.sheet-grip-zone');
    let y0 = null, dy = 0;
    const pt = (e) => (e.touches ? e.touches[0] : e).clientY;
    const start = (e) => { y0 = pt(e); dy = 0; sh.style.transition = 'none'; };
    const move = (e) => {
      if (y0 == null) return;
      dy = Math.max(0, pt(e) - y0);
      sh.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (y0 == null) return;
      y0 = null;
      if (dy > 60 || dy < 6) close();
      else { sh.style.transition = ''; sh.style.transform = ''; }
    };
    zone.addEventListener('touchstart', start, { passive: true });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('mousedown', (e) => { start(e); const mm = (ev) => move(ev); const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); }; window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); });
    if (onMount) onMount(sh, close);
    return close;
  }

  /* ---------- Icônes ---------- */
  const I = {
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
    cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.5" r="1.3"/><circle cx="17.5" cy="20.5" r="1.3"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.8"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    fire: '<svg viewBox="0 0 24 24"><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.5-5.4 3.6-8.3.4 1.9 1.4 3 2.4 3.6C11.8 7 13 4.6 15.4 3c-.3 3 3.1 5.6 3.1 10.6 0 4.3-2.6 7.4-6.5 7.4z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.7 4.7 0 0 0 7 18.5z"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/></svg>',
  };
  const ic = (n, cls = '') => `<span class="ic ${cls}" aria-hidden="true">${I[n]}</span>`;

  /* ---------- Navigation ---------- */
  const tabs = [
    { id: 'recettes', label: 'Recettes', icon: 'book' },
    { id: 'semaine', label: 'Semaine', icon: 'cal' },
    { id: 'courses', label: 'Courses', icon: 'cart' },
    { id: 'reglages', label: 'Réglages', icon: 'gear' },
  ];
  function nav(active) {
    $('#tabbar').innerHTML = tabs.map(t => `<a href="#/${t.id}" class="tab ${t.id === active ? 'on' : ''}" ${t.id === active ? 'aria-current="page"' : ''}>${ic(t.icon)}<span>${t.label}</span></a>`).join('');
  }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }

  let draft = null; // recette en cours d'édition (issue d'un scan ou nouvelle)
  let scanFiles = [];

  function route() {
    const parts = (location.hash || '#/recettes').replace(/^#\/?/, '').split('/');
    const [page, arg] = parts;
    window.scrollTo(0, 0);
    switch (page) {
      case 'recette': return viewRecette(arg);
      case 'editer': return viewEditor(arg);
      case 'scan': return viewScan();
      case 'semaine': return viewSemaine();
      case 'courses': return viewCourses();
      case 'reglages': return viewReglages();
      default: return viewRecettes();
    }
  }
  window.addEventListener('hashchange', route);

  /* ================= RECETTES ================= */
  let query = '';
  function viewRecettes() {
    nav('recettes');
    const all = S.data.recettes;
    const q = IngredientsDB.norm(query);
    const list = all.filter(r => !q || IngredientsDB.norm(r.titre + ' ' + (r.ingredients || []).map(i => i.nom).join(' ')).includes(q));
    app.innerHTML = `
      <header class="top">
        <h1>Mes recettes</h1>
        <p class="sub">${all.length ? `${all.length} recette${all.length > 1 ? 's' : ''}` : 'Ta bibliothèque de recettes'}${syncBadge()}</p>
      </header>
      ${all.length ? `<label class="search">${ic('search')}<input id="q" type="search" placeholder="Chercher une recette, un ingrédient…" value="${esc(query)}" autocomplete="off"></label>` : ''}
      ${all.length === 0 ? `
        <div class="empty">
          <div class="empty-art">${ic('camera')}</div>
          <h2>Scanne ta première recette</h2>
          <p>Prends en photo une fiche recette (recto et verso) : l'app lit les ingrédients et les étapes toute seule, sans connexion à une IA payante.</p>
          <a class="btn primary big" href="#/scan">${ic('camera')} Scanner une recette</a>
          <a class="btn ghost" href="#/editer/nouvelle">Saisir à la main</a>
        </div>` : `
        <div class="grid">
          ${list.map(cardRecette).join('') || `<p class="muted center pad">Aucune recette ne correspond à « ${esc(query)} ».</p>`}
        </div>`}
      ${all.length ? `<a class="fab" href="#/scan" aria-label="Scanner une recette">${ic('camera')}<span>Scanner</span></a>` : ''}
    `;
    const qi = $('#q');
    if (qi) qi.addEventListener('input', () => { query = qi.value; const pos = qi.selectionStart; viewRecettes(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  }
  function cardRecette(r) {
    const t = timeFor(r, defaultPers(r));
    return `<a class="card" href="#/recette/${r.id}">
      <div class="thumb">${r.photo ? `<img src="${r.photo}" alt="" loading="lazy">` : `<span class="thumb-ph">${esc((r.titre || '?').charAt(0))}</span>`}</div>
      <div class="card-body">
        <h3>${esc(r.titre || 'Sans titre')}</h3>
        <p class="meta">${t.total ? `${ic('clock')} ${t.total} min` : ''}${r.kcal ? ` · ${r.kcal} kcal` : ''}${r.source ? ` · ${esc(r.source)}` : ''}</p>
      </div>
    </a>`;
  }

  /* ================= DÉTAIL ================= */
  const persView = {};
  function viewRecette(id) {
    nav('recettes');
    const r = S.recette(id);
    if (!r) return go('#/recettes');
    const portions = r.portions && r.portions.length ? r.portions : [2];
    const n = persView[id] || defaultPers(r);
    const t = timeFor(r, n);
    const ings = r.ingredients || [];
    const box = ings.filter(i => !i.placard), placard = ings.filter(i => i.placard);
    const ingRow = (i) => {
      const q = fmtQty(qtyFor(i, n, portions), i.unite);
      return `<li><span class="q">${esc(q)}</span><span class="n">${esc(i.nom)}</span></li>`;
    };
    app.innerHTML = `
      <div class="hero ${r.photo ? '' : 'nophoto'}">
        ${r.photo ? `<img src="${r.photo}" alt="">` : ''}
        <a class="round back" href="#/recettes" aria-label="Retour">${ic('back')}</a>
        <a class="round edit" href="#/editer/${r.id}" aria-label="Modifier">${ic('edit')}</a>
      </div>
      <article class="detail">
        <h1>${esc(r.titre || 'Sans titre')}</h1>
        <div class="chips">
          ${t.cuisine ? `<span class="chip">${ic('clock')} ${t.cuisine} min en cuisine</span>` : ''}
          ${t.total && t.total !== t.cuisine ? `<span class="chip">À table dans ${t.total} min</span>` : ''}
          ${r.kcal ? `<span class="chip">${ic('fire')} ${r.kcal} kcal</span>` : ''}
          ${(r.tags || []).map(x => `<span class="chip soft">${esc(x)}</span>`).join('')}
        </div>
        ${r.source ? `<p class="credit">Recette ${esc(r.source)}</p>` : ''}
        <div class="pers">
          <span>${ic('users')} Pour</span>
          <button class="step" data-pers="-1" aria-label="Moins de personnes">${ic('minus')}</button>
          <strong>${n} pers.</strong>
          <button class="step" data-pers="1" aria-label="Plus de personnes">${ic('plus')}</button>
        </div>
        <button class="btn primary wide" id="plan-btn">${ic('cal')} Ajouter à ma semaine</button>

        <h2>Ingrédients</h2>
        <ul class="ings">${box.map(ingRow).join('')}</ul>
        ${placard.length ? `<h3 class="small">Dans le placard</h3><ul class="ings soft">${placard.map(ingRow).join('')}</ul>` : ''}
        ${r.ustensiles ? `<h3 class="small">Ustensiles</h3><p class="muted">${esc(r.ustensiles)}</p>` : ''}

        <h2>Étapes</h2>
        ${(r.etapes || []).map((s, si) => `
          ${s.titre ? `<h3 class="sec">${esc(s.titre)}</h3>` : ''}
          <ol class="steps">${s.lignes.map((l, li) => `<li data-step="${si}-${li}"><span class="dot"></span><span>${esc(l)}</span></li>`).join('')}</ol>
        `).join('') || '<p class="muted">Aucune étape.</p>'}
        ${r.astuce ? `<div class="tip"><strong>Astuce</strong><p>${esc(r.astuce)}</p></div>` : ''}
        <p class="muted small center pad">Touche une étape pour la barrer pendant que tu cuisines.</p>
      </article>`;
    app.querySelectorAll('[data-pers]').forEach(b => b.addEventListener('click', () => {
      persView[id] = Math.max(1, Math.min(20, n + Number(b.dataset.pers)));
      const y = window.scrollY; viewRecette(id); window.scrollTo(0, y);
    }));
    app.querySelectorAll('.steps li').forEach(li => li.addEventListener('click', () => li.classList.toggle('done')));
    $('#plan-btn').addEventListener('click', () => planSheet(r, n));
  }

  function planSheet(r, n) {
    const days = Array.from({ length: 14 }, (_, i) => addDays(mondayOf(new Date()), i)).filter(d => iso(d) >= iso(new Date()));
    let pers = n;
    sheet(`
      <h2>Quand ?</h2>
      <p class="muted">${esc(r.titre)}</p>
      <div class="pers center">
        <span>${ic('users')}</span>
        <button class="step" data-p="-1">${ic('minus')}</button><strong id="pp">${pers} pers.</strong><button class="step" data-p="1">${ic('plus')}</button>
      </div>
      <div class="daypick">
        ${days.map(d => {
          const k = iso(d), p = S.data.plan[k] || {};
          return `<div class="dayrow"><span>${fmtDay(d)}</span>
            ${Object.keys(REPAS).map(m => `<button class="slotbtn ${p[m] ? 'taken' : ''}" data-day="${k}" data-meal="${m}">${REPAS[m]}${p[m] ? ' ✓' : ''}</button>`).join('')}
          </div>`;
        }).join('')}
      </div>
      <button class="btn ghost wide" data-close>Annuler</button>
    `, (el, close) => {
      el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { pers = Math.max(1, pers + Number(b.dataset.p)); el.querySelector('#pp').textContent = pers + ' pers.'; }));
      el.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.day, m = b.dataset.meal;
        const ex = S.data.plan[k] && S.data.plan[k][m] && S.recette(S.data.plan[k][m].id);
        if (ex && ex.id !== r.id && !confirm(`Remplacer « ${ex.titre} » ?`)) return;
        S.data.plan[k] = S.data.plan[k] || {};
        S.data.plan[k][m] = { id: r.id, pers };
        S.save(); close();
        toast(`Ajouté : ${fmtDay(fromIso(k))}, ${REPAS[m].toLowerCase()}`);
      }));
    });
  }

  /* ================= SCAN ================= */
  function viewScan() {
    nav('recettes');
    app.innerHTML = `
      <header class="top with-back">
        <a class="round flat" href="#/recettes" aria-label="Retour">${ic('back')}</a>
        <div><h1>Scanner</h1><p class="sub">Recto + verso de la fiche</p></div>
      </header>
      <div class="pad-x">
        <div class="shots" id="shots"></div>
        <div class="row2">
          <label class="btn primary big">${ic('camera')} Prendre une photo
            <input type="file" accept="image/*" capture="environment" id="cam" hidden></label>
          <label class="btn soft big">${ic('image')} Galerie
            <input type="file" accept="image/*" multiple id="gal" hidden></label>
        </div>
        <ul class="hints">
          <li>Pose la fiche bien à plat, sous une bonne lumière, sans reflet.</li>
          <li>Cadre toute la fiche, texte bien droit et net.</li>
          <li>Ajoute toutes les faces (photo du plat, ingrédients, étapes).</li>
        </ul>
        <button class="btn primary wide big" id="go" ${scanFiles.length ? '' : 'disabled'}>Lire la recette</button>
        <div class="progress" id="prog" hidden><div class="bar"><i></i></div><p></p></div>
        <p class="center"><a href="#/editer/nouvelle" class="link">Ou saisir une recette à la main</a></p>
        <p class="muted small center">${Gemini.enabled()
          ? "Lecture par l'IA Google (Gemini). Sans réseau ou si la limite gratuite est atteinte, la lecture se fait dans le téléphone."
          : `Lecture dans le téléphone (Tesseract, gratuit, hors ligne). Pour une lecture bien plus fiable, active l'IA Google dans <a class="link" href="#/reglages">Réglages</a>.`}</p>
      </div>`;
    const renderShots = () => {
      const el = $('#shots');
      el.innerHTML = scanFiles.map((f, i) => `<div class="shot"><img src="${URL.createObjectURL(f)}" alt=""><span class="num">${i + 1}</span><button data-rm="${i}" aria-label="Retirer">${ic('x')}</button></div>`).join('')
        || `<div class="shot empty">${ic('camera')}<span>Aucune photo</span></div>`;
      el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { scanFiles.splice(Number(b.dataset.rm), 1); renderShots(); }));
      $('#go').disabled = !scanFiles.length;
    };
    renderShots();
    const add = (e) => { scanFiles.push(...Array.from(e.target.files || [])); e.target.value = ''; renderShots(); };
    $('#cam').addEventListener('change', add);
    $('#gal').addEventListener('change', add);
    $('#go').addEventListener('click', async () => {
      const prog = $('#prog'), bar = prog.querySelector('i'), txt = prog.querySelector('p');
      prog.hidden = false; $('#go').disabled = true;
      try {
        const prog_ = (t, f) => { txt.textContent = t; bar.style.width = Math.round(f * 100) + '%'; };
        let r;
        if (Gemini.enabled()) {
          try { r = await Gemini.scan(scanFiles, prog_); }
          catch (e) {
            console.warn(e);
            toast((e.message || "L'IA Google n'a pas répondu") + ' → lecture dans le téléphone');
          }
        }
        if (!r) r = await Scanner.scan(scanFiles, prog_);
        draft = r; draft._fromScan = true;
        scanFiles = [];
        go('#/editer/brouillon');
      } catch (e) {
        console.error(e);
        txt.textContent = e.message || 'Erreur pendant la lecture.';
        $('#go').disabled = false;
      }
    });
  }

  /* ================= ÉDITEUR ================= */
  function blankRecipe() {
    return { titre: '', source: '', portions: [S.data.reglages.pers || 2], temps: { cuisine: [], total: [] }, kcal: null, tags: [],
      ingredients: [{ nom: '', unite: '', q: [''], rayon: 'Autres', placard: false }], etapes: [{ titre: '', lignes: [] }], ustensiles: '', astuce: '' };
  }
  function viewEditor(arg) {
    nav('recettes');
    let r;
    if (arg === 'brouillon' && draft) r = draft;
    else if (arg === 'nouvelle') { r = draft && !draft.id && !draft._fromScan ? draft : blankRecipe(); draft = r; }
    else { const src = S.recette(arg); if (!src) return go('#/recettes'); r = JSON.parse(JSON.stringify(src)); draft = r; }
    const portions = r.portions && r.portions.length ? r.portions : [2];
    const toCheck = (r.ingredients || []).filter(i => i.verifier).length;
    const units = ['', 'g', 'kg', 'ml', 'cl', 'l', 'càs', 'càc', 'pincée', 'gousse', 'tranche', 'sachet', 'boîte', 'brin', 'botte', 'cm', 'filet', 'verre', 'bouquet', 'poignée', 'feuille'];
    const rayons = IngredientsDB.RAYONS.concat(['Placard']);
    const qv = (v) => (v === '' || v == null) ? '' : (typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : v);

    app.innerHTML = `
      <header class="top with-back">
        <a class="round flat" href="${r.id ? '#/recette/' + r.id : '#/recettes'}" aria-label="Annuler">${ic('back')}</a>
        <div><h1>${r._fromScan ? 'Vérifie la recette' : (r.id ? 'Modifier' : 'Nouvelle recette')}</h1>
        <p class="sub">${r._fromScan ? 'Corrige si besoin, puis enregistre' : ' '}</p></div>
      </header>
      <form class="editor pad-x" id="ed" autocomplete="off">
        ${r._fromScan && r.lu === 'ia' ? `<div class="notice ok">${ic('check')} <span>Lu par l'IA Google. Jette un œil rapide avant d'enregistrer.</span></div>` : ''}
        ${r._fromScan && toCheck ? `<div class="notice">${ic('warn')} <span>${toCheck} ingrédient${toCheck > 1 ? 's' : ''} à vérifier (surligné${toCheck > 1 ? 's' : ''} en orange).</span></div>` : ''}
        ${r.photo ? `<div class="ed-photo"><img src="${r.photo}" alt=""><button type="button" class="btn soft small" id="rm-photo">Retirer la photo</button></div>` : ''}
        <label class="fld"><span>Titre</span><input name="titre" value="${esc(r.titre)}" placeholder="Ex. Poulet curry coco" required></label>
        <div class="row2">
          <label class="fld"><span>Source (crédit)</span><input name="source" value="${esc(r.source)}" placeholder="Quitoque, livre, mamie…"></label>
          <label class="fld"><span>Calories (kcal)</span><input name="kcal" inputmode="numeric" value="${esc(r.kcal || '')}"></label>
        </div>
        <label class="fld"><span>Pour combien de personnes ? <em>(plusieurs colonnes : « 2, 3, 4, 5, 6 »)</em></span>
          <input name="portions" value="${esc(portions.join(', '))}" inputmode="text"></label>
        <div class="row2">
          <label class="fld"><span>En cuisine (min)</span><input name="cuisine" value="${esc((r.temps && r.temps.cuisine || []).join(', '))}" inputmode="text"></label>
          <label class="fld"><span>Temps total (min)</span><input name="total" value="${esc((r.temps && r.temps.total || []).join(', '))}" inputmode="text"></label>
        </div>

        <h2>Ingrédients</h2>
        <div id="ings">
          ${(r.ingredients || []).map((ing, k) => `
            <div class="ing-ed ${ing.verifier ? 'warn' : ''}" data-k="${k}">
              <div class="ing-top">
                <input class="nom" value="${esc(ing.nom)}" placeholder="Ingrédient" aria-label="Ingrédient">
                <button type="button" class="icon-btn" data-del-ing="${k}" aria-label="Supprimer">${ic('trash')}</button>
              </div>
              <div class="qs">
                ${portions.map((p, j) => `<label class="qcell"><small>${p} p.</small><input class="q" data-j="${j}" value="${esc(qv(ing.q[j]))}" inputmode="decimal"></label>`).join('')}
                <label class="qcell unit"><small>unité</small><select class="unite">${(units.includes(ing.unite) ? units : units.concat([ing.unite])).map(u => `<option ${u === ing.unite ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
              </div>
              <div class="ing-bot">
                <select class="rayon" aria-label="Rayon">${rayons.map(x => `<option ${x === ing.rayon ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
                <label class="chk"><input type="checkbox" class="placard" ${ing.placard ? 'checked' : ''}> placard</label>
              </div>
            </div>`).join('')}
        </div>
        <button type="button" class="btn soft wide" id="add-ing">${ic('plus')} Ajouter un ingrédient</button>

        <h2>Étapes <small class="muted">(une étape par ligne)</small></h2>
        <div id="steps">
          ${(r.etapes || []).map((s, k) => `
            <div class="step-ed" data-k="${k}">
              <div class="ing-top"><input class="st" value="${esc(s.titre)}" placeholder="Titre de la partie (facultatif)">
                <button type="button" class="icon-btn" data-del-step="${k}" aria-label="Supprimer">${ic('trash')}</button></div>
              <textarea class="sl" rows="${Math.max(3, s.lignes.length + 1)}" placeholder="Une étape par ligne">${esc(s.lignes.join('\n'))}</textarea>
            </div>`).join('')}
        </div>
        <button type="button" class="btn soft wide" id="add-step">${ic('plus')} Ajouter une partie</button>

        <label class="fld"><span>Ustensiles</span><textarea name="ustensiles" rows="2">${esc(r.ustensiles)}</textarea></label>
        <label class="fld"><span>Astuce</span><textarea name="astuce" rows="3">${esc(r.astuce)}</textarea></label>
        ${r.texteBrut ? `<details class="raw"><summary>Texte lu par le scanner</summary><pre>${esc(r.texteBrut)}</pre></details>` : ''}

        <div class="ed-actions">
          <button type="submit" class="btn primary wide big">${ic('check')} Enregistrer</button>
          ${r.id ? `<button type="button" class="btn danger wide" id="del">${ic('trash')} Supprimer la recette</button>` : ''}
        </div>
      </form>`;

    const form = $('#ed');
    // Relit le formulaire dans r (sans changer de page)
    const collect = () => {
      const f = new FormData(form);
      r.titre = (f.get('titre') || '').trim();
      r.source = (f.get('source') || '').trim();
      r.kcal = parseInt(f.get('kcal'), 10) || null;
      const nums = (s) => String(s || '').split(/[,;\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
      const newP = nums(f.get('portions'));
      r.portions = newP.length ? newP : [2];
      r.temps = { cuisine: nums(f.get('cuisine')), total: nums(f.get('total')) };
      r.ustensiles = (f.get('ustensiles') || '').trim();
      r.astuce = (f.get('astuce') || '').trim();
      r.ingredients = Array.from(form.querySelectorAll('.ing-ed')).map((el) => {
        const k = Number(el.dataset.k), old = (draft.ingredients || [])[k] || {};
        const q = Array.from(el.querySelectorAll('.q')).map(i => {
          const v = i.value.trim(); const n = RecipeParser.toNumber(v);
          return n != null ? n : v;
        });
        return { nom: el.querySelector('.nom').value.trim(), unite: el.querySelector('.unite').value, q,
          rayon: el.querySelector('.rayon').value, placard: el.querySelector('.placard').checked, verifier: el.classList.contains('warn') && old.verifier };
      });
      r.etapes = Array.from(form.querySelectorAll('.step-ed')).map(el => ({
        titre: el.querySelector('.st').value.trim(),
        lignes: el.querySelector('.sl').value.split('\n').map(x => x.trim()).filter(Boolean),
      }));
    };
    // si le nombre de colonnes de portions change, on adapte les quantités
    form.portions.addEventListener('change', () => {
      const oldP = portions.slice();
      collect();
      r.ingredients.forEach(ing => {
        const map = r.portions.map(p => { const i = oldP.indexOf(p); return i >= 0 ? ing.q[i] : (typeof ing.q[0] === 'number' ? Math.round(ing.q[0] * p / oldP[0] * 10) / 10 : ing.q[0] || ''); });
        ing.q = map;
      });
      rerender();
    });
    const rerender = () => { const y = window.scrollY; viewEditor('brouillon'); window.scrollTo(0, y); };
    form.addEventListener('input', (e) => { const c = e.target.closest('.ing-ed'); if (c) c.classList.remove('warn'); });
    form.addEventListener('change', (e) => {
      // nom d'ingrédient modifié -> rayon deviné automatiquement
      if (e.target.classList.contains('nom')) {
        const m = IngredientsDB.match(e.target.value);
        const sel = e.target.closest('.ing-ed').querySelector('.rayon');
        if (m && sel.value === 'Autres') sel.value = m.entry.rayon;
      }
    });
    $('#add-ing').addEventListener('click', () => { collect(); r.ingredients.push({ nom: '', unite: '', q: r.portions.map(() => ''), rayon: 'Autres', placard: false }); rerender(); setTimeout(() => { const all = form.querySelectorAll('.nom'); all[all.length - 1] && all[all.length - 1].focus(); }, 0); });
    $('#add-step').addEventListener('click', () => { collect(); r.etapes.push({ titre: '', lignes: [] }); rerender(); });
    form.querySelectorAll('[data-del-ing]').forEach(b => b.addEventListener('click', () => { collect(); r.ingredients.splice(Number(b.dataset.delIng), 1); rerender(); }));
    form.querySelectorAll('[data-del-step]').forEach(b => b.addEventListener('click', () => { collect(); r.etapes.splice(Number(b.dataset.delStep), 1); rerender(); }));
    const rp = $('#rm-photo'); if (rp) rp.addEventListener('click', () => { collect(); r.photo = null; rerender(); });
    const del = $('#del');
    if (del) del.addEventListener('click', () => {
      if (!confirm('Supprimer définitivement cette recette ?')) return;
      S.remove(r.id); draft = null; toast('Recette supprimée'); go('#/recettes');
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      collect();
      if (!r.titre) { form.titre.focus(); return toast('Donne un titre à la recette'); }
      r.ingredients = r.ingredients.filter(i => i.nom).map(i => { delete i.verifier; return i; });
      r.etapes = r.etapes.filter(s => s.lignes.length || s.titre);
      delete r._fromScan; delete r.lu;
      const saved = S.upsert(r);
      draft = null;
      toast('Recette enregistrée');
      go('#/recette/' + saved.id);
    });
  }

  /* ================= SEMAINE ================= */
  function weekNav(title) {
    const days = weekDays();
    const thisWeek = iso(mondayOf(new Date())) === weekKey();
    return `<div class="weeknav">
      <button class="round flat" data-w="-1" aria-label="Semaine précédente">${ic('left')}</button>
      <div><strong>${title}</strong><span>${thisWeek ? 'Cette semaine · ' : ''}${days[0].getDate()} ${MOIS[days[0].getMonth()]} → ${days[6].getDate()} ${MOIS[days[6].getMonth()]}</span></div>
      <button class="round flat" data-w="1" aria-label="Semaine suivante">${ic('right')}</button>
    </div>`;
  }
  function bindWeekNav(fn) {
    app.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => { weekStart = addDays(weekStart, 7 * Number(b.dataset.w)); fn(); }));
  }
  function mealsOfWeek() {
    const out = [];
    for (const d of weekDays()) {
      const p = S.data.plan[iso(d)] || {};
      for (const m of Object.keys(REPAS)) if (p[m]) { const r = S.recette(p[m].id); if (r) out.push({ date: d, meal: m, r, pers: p[m].pers || 2 }); }
    }
    return out;
  }
  function viewSemaine() {
    nav('semaine');
    const today = iso(new Date());
    const meals = mealsOfWeek();
    app.innerHTML = `
      <header class="top"><h1>Ma semaine</h1><p class="sub">Choisis ce que tu manges chaque jour</p></header>
      ${weekNav('Menu')}
      <div class="days">
        ${weekDays().map(d => {
          const k = iso(d), p = S.data.plan[k] || {};
          return `<section class="day ${k === today ? 'today' : ''} ${k < today ? 'past' : ''}">
            <h3>${fmtDay(d)}${k === today ? ' <em>aujourd\'hui</em>' : ''}</h3>
            ${Object.keys(REPAS).map(m => {
              const e = p[m], r = e && S.recette(e.id);
              return r ? `<div class="slot full">
                  <span class="lbl">${REPAS[m]}</span>
                  <a href="#/recette/${r.id}" class="slot-main">${r.photo ? `<img src="${r.photo}" alt="">` : ''}<span><strong>${esc(r.titre)}</strong><small>${e.pers} pers.</small></span></a>
                  <button class="icon-btn" data-clear="${k}|${m}" aria-label="Retirer">${ic('x')}</button>
                </div>`
                : `<button class="slot add" data-add="${k}|${m}"><span class="lbl">${REPAS[m]}</span><span>${ic('plus')} Choisir un plat</span></button>`;
            }).join('')}
          </section>`;
        }).join('')}
      </div>
      <div class="pad-x actions-col">
        <a class="btn primary wide big" href="#/courses">${ic('cart')} Voir la liste de courses${meals.length ? ` (${meals.length} repas)` : ''}</a>
        <button class="btn soft wide" id="ics" ${meals.length ? '' : 'disabled'}>${ic('bell')} Mettre dans mon calendrier + rappels</button>
      </div>`;
    bindWeekNav(viewSemaine);
    app.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
      const [k, m] = b.dataset.clear.split('|'); delete S.data.plan[k][m]; S.save(); viewSemaine();
    }));
    app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
      const [k, m] = b.dataset.add.split('|'); pickSheet(k, m);
    }));
    $('#ics').addEventListener('click', () => exportICS(meals));
  }
  function pickSheet(k, m) {
    const list = S.data.recettes;
    let pers = S.data.reglages.pers || 2;
    sheet(`
      <h2>${fmtDay(fromIso(k))} · ${REPAS[m]}</h2>
      ${list.length ? `
        <label class="search">${ic('search')}<input id="pq" type="search" placeholder="Chercher…"></label>
        <div class="pers center"><span>${ic('users')}</span>
          <button class="step" data-p="-1">${ic('minus')}</button><strong id="pp">${pers} pers.</strong><button class="step" data-p="1">${ic('plus')}</button></div>
        <div class="picklist">${list.map(r => `<button class="pick" data-id="${r.id}" data-t="${esc(IngredientsDB.norm(r.titre))}">
          ${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="thumb-ph sm">${esc((r.titre || '?')[0])}</span>`}<span>${esc(r.titre)}</span></button>`).join('')}</div>`
        : `<p class="muted">Tu n'as pas encore de recette.</p><a class="btn primary wide" href="#/scan" data-close>${ic('camera')} Scanner une recette</a>`}
      <button class="btn ghost wide" data-close>Annuler</button>
    `, (el, close) => {
      const q = el.querySelector('#pq');
      if (q) q.addEventListener('input', () => { const v = IngredientsDB.norm(q.value); el.querySelectorAll('.pick').forEach(p => { p.hidden = !p.dataset.t.includes(v); }); });
      el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { pers = Math.max(1, pers + Number(b.dataset.p)); el.querySelector('#pp').textContent = pers + ' pers.'; }));
      el.querySelectorAll('.pick').forEach(b => b.addEventListener('click', () => {
        S.data.plan[k] = S.data.plan[k] || {};
        S.data.plan[k][m] = { id: b.dataset.id, pers };
        S.save(); close(); viewSemaine();
      }));
    });
  }

  /* ---------- Calendrier (.ics) ---------- */
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 74) return line;
    const out = []; let cur = '';
    for (const ch of line) {
      if (enc.encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
    }
    out.push(cur); return out.join('\r\n');
  }
  const icsDate = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  function exportICS(meals) {
    const R = S.data.reglages;
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Recette//Planning repas//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mes repas'];
    for (const e of meals) {
      const [hh, mm] = (e.meal === 'midi' ? R.heureMidi : R.heureSoir).split(':').map(Number);
      const mealAt = new Date(e.date); mealAt.setHours(hh, mm, 0, 0);
      const t = timeFor(e.r, e.pers);
      const dur = t.total || t.cuisine || 30;
      const start = new Date(mealAt.getTime() - dur * 60000);
      const portions = e.r.portions || [2];
      const ings = (e.r.ingredients || []).map(i => `• ${[fmtQty(qtyFor(i, e.pers, portions), i.unite), i.nom].filter(Boolean).join(' ')}`).join('\n');
      const desc = `${e.pers} pers. · à table à ${(e.meal === 'midi' ? R.heureMidi : R.heureSoir)}\n\nIngrédients :\n${ings}\n\n${location.origin + location.pathname}#/recette/${e.r.id}`;
      L.push('BEGIN:VEVENT',
        `UID:recette-${iso(e.date)}-${e.meal}@recette-app`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDate(start)}`,
        `DTEND:${icsDate(mealAt)}`,
        `SUMMARY:${icsEsc('🍳 ' + e.r.titre + ' (' + e.pers + ' pers.)')}`,
        `DESCRIPTION:${icsEsc(desc)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('C\'est l\'heure de cuisiner : ' + e.r.titre)}`, `TRIGGER:-PT${Math.max(0, R.rappel | 0)}M`, 'END:VALARM',
        'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    const body = L.map(fold).join('\r\n') + '\r\n';
    const name = `repas-semaine-${weekKey()}.ics`;
    const file = new File([body], name, { type: 'text/calendar' });
    sheet(`
      <h2>Ajouter au calendrier</h2>
      <p class="muted">${meals.length} repas, chacun avec un rappel ${R.rappel} min avant de commencer à cuisiner (modifiable dans Réglages).</p>
      <button class="btn primary wide big" id="dl">${ic('cal')} Ouvrir dans le calendrier</button>
      ${navigator.canShare && navigator.canShare({ files: [file] }) ? `<button class="btn soft wide" id="sh">${ic('share')} Partager le fichier…</button>` : ''}
      <p class="muted small">iPhone : touche « Tout ajouter ». Android : ouvre le fichier téléchargé avec Google Agenda. Si tu réimportes la même semaine, les repas sont mis à jour.</p>
      <button class="btn ghost wide" data-close>Fermer</button>
    `, (el) => {
      el.querySelector('#dl').addEventListener('click', () => {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      });
      const sh = el.querySelector('#sh');
      if (sh) sh.addEventListener('click', () => navigator.share({ files: [file], title: 'Mes repas' }).catch(() => {}));
    });
  }

  /* ================= COURSES ================= */
  const RAYON_ORDER = IngredientsDB.RAYONS.concat(['Placard']);
  function shoppingList() {
    const map = new Map();
    for (const e of mealsOfWeek()) {
      const portions = e.r.portions || [2];
      for (const ing of e.r.ingredients || []) {
        const k = IngredientsDB.key(ing.nom) + '|' + (ing.unite || '');
        let it = map.get(k);
        if (!it) { it = { key: k, nom: ing.nom, unite: ing.unite || '', total: 0, hasNum: false, txt: new Set(), rayon: ing.rayon || 'Autres', placard: !!ing.placard, from: new Set() }; map.set(k, it); }
        const q = qtyFor(ing, e.pers, portions);
        if (typeof q === 'number') { it.total += q; it.hasNum = true; } else if (q) it.txt.add(q);
        if (!ing.placard) it.placard = false;
        it.from.add(e.r.titre);
      }
    }
    return Array.from(map.values());
  }
  function itemLabel(it) {
    const parts = [];
    if (it.hasNum) parts.push(fmtQty(it.total, it.unite));
    it.txt.forEach(t => parts.push(it.unite && !it.hasNum ? `${t} ${it.unite}` : t));
    return { q: parts.join(' + '), n: it.nom };
  }
  function viewCourses() {
    nav('courses');
    const wk = weekKey();
    const items = shoppingList();
    const extras = S.data.extras[wk] || [];
    const isOn = (k) => !!S.data.coches[wk + '|' + k];
    const groups = {};
    for (const it of items) { const g = it.placard ? 'Placard' : it.rayon; (groups[g] = groups[g] || []).push(it); }
    const total = items.length + extras.length;
    const done = items.filter(i => isOn(i.key)).length + extras.filter(x => x.fait).length;
    app.innerHTML = `
      <header class="top"><h1>Courses</h1><p class="sub">${total ? `${done}/${total} dans le panier` : 'Calculée depuis ta semaine'}</p></header>
      ${weekNav('Liste')}
      ${!items.length && !extras.length ? `
        <div class="empty small">
          <div class="empty-art">${ic('cart')}</div>
          <p>Aucun repas prévu cette semaine. Ajoute des plats dans « Semaine » et la liste se remplit toute seule.</p>
          <a class="btn primary" href="#/semaine">${ic('cal')} Planifier ma semaine</a>
        </div>` : ''}
      <div class="shop">
        ${RAYON_ORDER.filter(g => groups[g]).map(g => `
          <section><h3>${g === 'Placard' ? 'Dans le placard (à vérifier)' : esc(g)}</h3>
            <ul>${groups[g].sort((a, b) => isOn(a.key) - isOn(b.key) || a.nom.localeCompare(b.nom)).map(it => {
              const l = itemLabel(it);
              return `<li class="${isOn(it.key) ? 'on' : ''}" data-key="${esc(it.key)}">
                <span class="box">${ic('check')}</span>
                <span class="it"><span><b>${esc(l.q)}</b> ${esc(l.n)}</span><small>${esc(Array.from(it.from).join(' · '))}</small></span>
              </li>`;
            }).join('')}</ul>
          </section>`).join('')}
        <section><h3>Ajouté à la main</h3>
          <ul>${extras.map(x => `<li class="${x.fait ? 'on' : ''}" data-extra="${x.id}"><span class="box">${ic('check')}</span><span class="it"><span>${esc(x.texte)}</span></span><button class="icon-btn" data-rmx="${x.id}" aria-label="Supprimer">${ic('x')}</button></li>`).join('')}</ul>
          <form id="addx" class="addx"><input id="xt" placeholder="Ajouter un article (ex. papier toilette)" autocomplete="off"><button class="btn primary" aria-label="Ajouter">${ic('plus')}</button></form>
        </section>
      </div>
      ${total ? `<div class="pad-x actions-col">
        <button class="btn primary wide" id="share">${ic('share')} Envoyer vers Notes / messages</button>
        <button class="btn ghost wide" id="uncheck">Tout décocher</button>
      </div>` : ''}`;
    bindWeekNav(viewCourses);
    app.querySelectorAll('[data-key]').forEach(li => li.addEventListener('click', () => {
      const k = wk + '|' + li.dataset.key;
      if (S.data.coches[k]) delete S.data.coches[k]; else S.data.coches[k] = true;
      S.save(); const y = window.scrollY; viewCourses(); window.scrollTo(0, y);
    }));
    app.querySelectorAll('[data-extra]').forEach(li => li.addEventListener('click', (e) => {
      if (e.target.closest('[data-rmx]')) return;
      const x = extras.find(z => z.id === li.dataset.extra); x.fait = !x.fait; S.save(); const y = window.scrollY; viewCourses(); window.scrollTo(0, y);
    }));
    app.querySelectorAll('[data-rmx]').forEach(b => b.addEventListener('click', () => {
      S.data.extras[wk] = extras.filter(z => z.id !== b.dataset.rmx); S.save(); viewCourses();
    }));
    $('#addx').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#xt').value.trim(); if (!v) return;
      S.data.extras[wk] = extras.concat([{ id: S.uid(), texte: v, fait: false }]); S.save(); viewCourses();
      setTimeout(() => $('#xt').focus(), 0);
    });
    const sh = $('#share');
    if (sh) sh.addEventListener('click', async () => {
      const d = weekDays();
      let txt = `🛒 Courses — semaine du ${d[0].getDate()} ${MOIS[d[0].getMonth()]}\n`;
      for (const g of RAYON_ORDER.filter(x => groups[x])) {
        const todo = groups[g].filter(it => !isOn(it.key));
        if (!todo.length) continue;
        txt += `\n${g === 'Placard' ? 'Placard (à vérifier)' : g}\n` + todo.map(it => { const l = itemLabel(it); return `☐ ${[l.q, l.n].filter(Boolean).join(' ')}`; }).join('\n') + '\n';
      }
      const ex = extras.filter(x => !x.fait);
      if (ex.length) txt += `\nAutres\n` + ex.map(x => `☐ ${x.texte}`).join('\n') + '\n';
      try {
        if (navigator.share) await navigator.share({ title: 'Liste de courses', text: txt });
        else { await navigator.clipboard.writeText(txt); toast('Liste copiée : colle-la dans Notes'); }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        try { await navigator.clipboard.writeText(txt); toast('Liste copiée : colle-la dans Notes'); } catch (_) { alert(txt); }
      }
    });
    const un = $('#uncheck');
    if (un) un.addEventListener('click', () => {
      Object.keys(S.data.coches).filter(k => k.startsWith(wk + '|')).forEach(k => delete S.data.coches[k]);
      extras.forEach(x => { x.fait = false; }); S.save(); viewCourses();
    });
  }

  /* ================= RÉGLAGES ================= */
  function viewReglages() {
    nav('reglages');
    const R = S.data.reglages;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    app.innerHTML = `
      <header class="top"><h1>Réglages</h1><p class="sub">Horaires, rappels et sauvegarde</p></header>
      <div class="pad-x editor">${geminiSection()}${syncSection()}</div>
      <form class="pad-x editor" id="rg">
        <h2>Repas & rappels</h2>
        <div class="row2">
          <label class="fld"><span>Heure du midi</span><input type="time" name="heureMidi" value="${esc(R.heureMidi)}"></label>
          <label class="fld"><span>Heure du soir</span><input type="time" name="heureSoir" value="${esc(R.heureSoir)}"></label>
        </div>
        <div class="row2">
          <label class="fld"><span>Rappel (min avant de cuisiner)</span><input type="number" min="0" max="600" name="rappel" value="${esc(R.rappel)}"></label>
          <label class="fld"><span>Personnes par défaut</span><input type="number" min="1" max="20" name="pers" value="${esc(R.pers)}"></label>
        </div>
        <p class="muted small">Dans le calendrier, chaque repas commence au moment où il faut se mettre en cuisine (heure du repas moins le temps de la recette), avec une alarme avant.</p>

        <h2>Sauvegarde</h2>
        <p class="muted small">Tes recettes sont enregistrées dans ce téléphone. Fais une sauvegarde de temps en temps, par exemple dans Fichiers ou Google Drive.</p>
        <div class="row2">
          <button type="button" class="btn soft" id="exp">Exporter</button>
          <label class="btn soft">Importer<input type="file" accept="application/json,.json" id="imp" hidden></label>
        </div>

        ${standalone ? '' : `<h2>Installer l'app</h2>
        <div class="tip"><p>${isIOS
          ? 'Dans Safari, touche le bouton <b>Partager</b> puis <b>« Sur l\'écran d\'accueil »</b>.'
          : 'Dans Chrome, touche le menu <b>⋮</b> puis <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.'} L'app s'ouvrira alors comme une vraie application, même sans réseau.</p></div>`}

        <h2>Zone sensible</h2>
        <button type="button" class="btn danger wide" id="reset">Tout effacer</button>
        <p class="muted small center pad">Recette · v1 · lecture des photos par Tesseract.js (open source)</p>
      </form>`;
    bindSync(); bindGemini();
    const f = $('#rg');
    f.addEventListener('change', () => {
      R.heureMidi = f.heureMidi.value || '12:30';
      R.heureSoir = f.heureSoir.value || '19:30';
      R.rappel = Math.max(0, parseInt(f.rappel.value, 10) || 0);
      R.pers = Math.max(1, parseInt(f.pers.value, 10) || 2);
      S.save(); toast('Réglages enregistrés');
    });
    $('#exp').addEventListener('click', async () => {
      const file = new File([S.exportJSON()], `recettes-sauvegarde-${iso(new Date())}.json`, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Sauvegarde recettes' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    $('#imp').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { const n = S.importJSON(await file.text()); toast(`${n} recette${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`); }
      catch (err) { alert('Import impossible : ' + err.message); }
      e.target.value = '';
    });
    $('#reset').addEventListener('click', () => {
      if (confirm('Effacer toutes les recettes, la semaine et la liste de courses ?') && confirm('Vraiment tout effacer ? Cette action est définitive.')) { S.reset(); toast('Tout est effacé'); go('#/recettes'); }
    });
  }


  /* ---------- IA Google (Réglages) ---------- */
  function geminiSection() {
    const st = Gemini.status();
    if (st.on) return `<h2>Lecture des fiches par IA</h2>
      <div class="sync-card"><p class="sync-name">${ic('check')} <b>IA Google activée</b> <span class="chip soft">${esc(st.model || '')}</span></p>
      <p class="muted small">Les scans sont lus par Gemini. La clé reste dans ce téléphone.</p></div>
      <button type="button" class="btn ghost wide" id="gm-off">Désactiver l'IA Google</button>`;
    return `<h2>Lecture des fiches par IA</h2>
      <p class="muted small">Par défaut, la lecture se fait dans le téléphone (moins fiable). Avec une clé gratuite Google, l'IA Gemini lit les fiches presque parfaitement.</p>
      <details class="howto"><summary>Obtenir une clé gratuite (2 minutes)</summary>
        <ol>
          <li>Va sur <a class="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> et connecte-toi avec ton compte Google.</li>
          <li>Touche <b>Create API key</b> (« Créer une clé API »).</li>
          <li>Touche l'icône « copier » à côté de la clé (elle commence par <code>AQ.</code> ou <code>AIza</code>) et colle-la ci-dessous.</li>
        </ol>
        <p class="small muted">Gratuit dans la limite d'utilisation de Google. Les photos scannées sont envoyées à Google pour être lues.</p>
      </details>
      <label class="fld"><span>Clé Google (Gemini)</span><input id="gm-key" type="password" placeholder="AQ.… ou AIza…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p class="small err-text" id="gm-err" hidden></p>
      <button type="button" class="btn primary wide" id="gm-go">${ic('check')} Activer l'IA Google</button>`;
  }
  function bindGemini() {
    const off = $('#gm-off'), go_ = $('#gm-go');
    if (off) off.addEventListener('click', () => { Gemini.disconnect(); toast('IA Google désactivée'); viewReglages(); });
    if (go_) go_.addEventListener('click', async () => {
      const err = $('#gm-err'); err.hidden = true;
      go_.disabled = true; go_.textContent = 'Vérification…';
      try { await Gemini.connect($('#gm-key').value); toast('IA Google activée'); viewReglages(); }
      catch (e) { err.textContent = e.message; err.hidden = false; go_.disabled = false; go_.innerHTML = `${ic('check')} Activer l'IA Google`; }
    });
  }

  /* ---------- Synchronisation GitHub (Réglages) ---------- */
  function ago(isoStr) {
    if (!isoStr) return '';
    const m = Math.round((Date.now() - new Date(isoStr).getTime()) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    if (m < 24 * 60) return `il y a ${Math.round(m / 60)} h`;
    const d = new Date(isoStr); return `le ${d.getDate()} ${MOIS[d.getMonth()]}`;
  }
  function syncSection() {
    const st = Sync.status();
    if (st.on) {
      return `<h2>Synchronisation GitHub</h2>
        <div class="sync-card ${st.error ? 'err' : ''}">
          <p class="sync-name">${ic('cloud')} <b>${esc(st.nom)}</b> ${st.prive === false ? '<span class="chip soft">public · partagé</span>' : '<span class="chip soft">privé</span>'}</p>
          <p class="muted small" id="sync-state">${st.running ? 'Synchronisation…' : st.error ? '⚠ ' + esc(st.error) : st.last ? 'Synchronisé ' + ago(st.last) : 'Première synchronisation…'}</p>
          ${st.prive === false ? `<p class="small">Dépôt public : tes recettes sont partagées sur le site pour tout le monde.</p>` : ''}
        </div>
        <div class="row2">
          <button type="button" class="btn soft" id="sync-now">Synchroniser</button>
          <button type="button" class="btn ghost" id="sync-off">Déconnecter</button>
        </div>
        <p class="muted small">Tout se synchronise automatiquement : recettes, semaine, liste de courses et réglages.</p>`;
    }
    const host = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    const guess = host ? `${host[1]}/${location.pathname.split('/').filter(Boolean)[0] || 'recette'}` : '';
    return `<h2>Publier mes recettes sur GitHub</h2>
      <p class="muted small">Pour le propriétaire du site : tes recettes et ta semaine sont envoyées sur GitHub. Tes autres téléphones les retrouvent automatiquement, et tout le monde peut profiter des recettes sur le site.</p>
      <details class="howto"><summary>Comment faire (2 minutes, une seule fois)</summary>
        <ol>
          <li>Crée un jeton d'accès : <a class="link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">nouveau jeton GitHub</a>.<br>
            Nom : <i>Recette</i> · Expiration : la plus longue possible<br>
            <i>Repository access</i> → <b>Only select repositories</b> → ${esc(guess ? guess.split('/')[1] : 'recette')}<br>
            <i>Permissions</i> → <i>Repository permissions</i> → <b>Contents : Read and write</b><br>
            Puis <i>Generate token</i> et copie le jeton (il commence par <code>github_pat_</code>).</li>
          <li>Colle le dépôt et le jeton ci-dessous. Sur ton autre téléphone, fais juste cette étape avec le même jeton.</li>
        </ol>
      </details>
      <label class="fld"><span>Dépôt</span><input id="sy-repo" value="${esc(guess)}" placeholder="pseudo/recette" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label class="fld"><span>Jeton GitHub</span><input id="sy-token" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p class="small err-text" id="sy-err" hidden></p>
      <button type="button" class="btn primary wide" id="sy-go">${ic('cloud')} Connecter et synchroniser</button>
      <p class="muted small">Le jeton reste dans ce téléphone et n'est jamais inclus dans les sauvegardes exportées.</p>`;
  }
  function bindSync() {
    const now = $('#sync-now'), off = $('#sync-off'), go_ = $('#sy-go');
    if (now) now.addEventListener('click', () => { Sync.run(); const el = $('#sync-state'); if (el) el.textContent = 'Synchronisation…'; });
    if (off) off.addEventListener('click', () => {
      if (!confirm('Déconnecter ce téléphone de GitHub ? Tes recettes restent sur le téléphone et sur GitHub.')) return;
      Sync.disconnect(); viewReglages();
    });
    if (go_) go_.addEventListener('click', async () => {
      const err = $('#sy-err'); err.hidden = true;
      go_.disabled = true; go_.textContent = 'Connexion…';
      try {
        const r = await Sync.connect($('#sy-repo').value, $('#sy-token').value);
        if (r.error) throw new Error(r.error);
        toast(r.prive ? 'Synchronisation activée' : 'Synchronisation activée, recettes partagées');
        viewReglages();
      } catch (e) {
        if (Sync.status().on) { viewReglages(); return; }
        err.textContent = e.message; err.hidden = false;
        go_.disabled = false; go_.innerHTML = `${ic('cloud')} Connecter et synchroniser`;
      }
    });
  }
  function syncBadge() {
    const st = Sync.status();
    if (!st.on) return '';
    return ` · <span class="syncb ${st.error ? 'err' : ''}">${ic('cloud')}${st.running ? 'synchro…' : st.error ? 'erreur de synchro' : 'synchronisé'}</span>`;
  }

  /* ---------- Démarrage ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  Sync.on((ev) => {
    const page = (location.hash || '#/recettes').replace(/^#\/?/, '').split('/')[0];
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (ev.changed && /editer|scan/.test(page)) { toast('Recettes mises à jour depuis GitHub'); return; }
    if (typing) return;
    if (page === 'reglages') {
      // Réglages : on ne redessine pas l'écran (ça effacerait une clé ou un jeton en cours de saisie)
      const st = Sync.status(), el = $('#sync-state');
      if (el && st.on) el.textContent = st.running ? 'Synchronisation…' : st.error ? '⚠ ' + st.error : st.last ? 'Synchronisé ' + ago(st.last) : 'Première synchronisation…';
      if (ev.changed) toast('Mis à jour depuis GitHub');
      return;
    }
    if (ev.changed || page === 'recettes' || page === '') { const y = window.scrollY; route(); window.scrollTo(0, y); }
    if (ev.changed) toast('Mis à jour depuis GitHub');
  });
  app.innerHTML = '<p class="muted center pad">Chargement…</p>';
  S.load().then(() => { route(); Sync.schedule(400); });
})();

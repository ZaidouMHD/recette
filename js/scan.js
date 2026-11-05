// Scanner : prépare les photos (contraste, seuillage) puis lit le texte avec Tesseract.js,
// un moteur de reconnaissance de texte open source qui tourne entièrement dans le téléphone.
(function (root) {
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let loading = null;

  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = () => resolve(root.Tesseract);
      s.onerror = () => { loading = null; reject(new Error("Impossible de charger le moteur de lecture. Vérifie ta connexion (nécessaire la première fois).")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible')); };
      img.src = url;
    });
  }

  // Niveaux de gris + seuillage adaptatif (moyenne locale via image intégrale).
  // Supprime les fonds colorés, les ombres et les reflets doux.
  function preprocess(img) {
    let w = img.naturalWidth, h = img.naturalHeight;
    const target = w > 2000 ? 2000 : (w < 1200 ? 1200 : w);
    h = Math.round(h * target / w); w = target;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const W = w + 1;
    const I = new Float64Array(W * (h + 1));
    for (let y = 1; y <= h; y++) {
      let s = 0;
      for (let x = 1; x <= w; x++) { s += g[(y - 1) * w + x - 1]; I[y * W + x] = I[(y - 1) * W + x] + s; }
    }
    const r = Math.max(8, Math.round(w / 40)), T = 0.12;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const sum = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        const v = g[y * w + x] < mean * (1 - T) ? 0 : 255;
        const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }

  function thumbnail(img, max = 480) {
    const s = Math.min(1, max / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  // Garde les lignes (texte) et les mots avec leur position sur la photo
  function toPage(data, width, height) {
    const median = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const lines = (data.lines || []).map(l => {
      const hs = (l.words || []).filter(w => /[A-Za-zÀ-ÿ]{2}/.test(w.text)).map(w => w.bbox.y1 - w.bbox.y0);
      return { text: (l.text || '').replace(/\n$/, ''), h: median(hs) || (l.bbox.y1 - l.bbox.y0), conf: l.confidence };
    });
    const words = (data.words || []).map(w => ({ t: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence }));
    return { width, height, lines, words };
  }

  // files : liste de photos (recto, verso…). onProgress(texte, fraction 0..1)
  async function scan(files, onProgress) {
    const say = (t, f) => onProgress && onProgress(t, f);
    say("Chargement de l'IA de lecture…", 0.02);
    const T = await loadTesseract();
    let current = 0;
    const n = files.length;
    const worker = await T.createWorker('fra', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') say(`Lecture de la photo ${current + 1}/${n}…`, (current + m.progress) / n * 0.9 + 0.08);
        else if (/load|initializ/.test(m.status)) say('Préparation de l\'IA (la 1ʳᵉ fois, ~5 Mo à télécharger)…', 0.05);
      },
    });
    await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
    const pages = [];
    let photo = null;
    try {
      for (current = 0; current < n; current++) {
        say(`Préparation de la photo ${current + 1}/${n}…`, current / n * 0.9 + 0.08);
        const img = await loadImage(files[current]);
        if (!photo) photo = thumbnail(img);
        const canvas = preprocess(img);
        const { data } = await worker.recognize(canvas);
        const page = toPage(data, canvas.width, canvas.height);
        // 2e passage : la zone « Ingrédients » est relue ligne par ligne (mode tableau)
        const rects = root.RecipeParser.regionRects(page);
        if (rects.ingredients) {
          say(`Lecture du tableau des ingrédients…`, (current + 0.95) / n * 0.9 + 0.08);
          await worker.setParameters({ tessedit_pageseg_mode: '6' });
          const z = await worker.recognize(canvas, { rectangle: rects.ingredients });
          page.zones = { ingredients: (z.data.lines || []).filter(l => l.confidence > 30).map(l => l.text.replace(/\n$/, '')) };
          await worker.setParameters({ tessedit_pageseg_mode: '3' });
        }
        pages.push(page);
      }
    } finally {
      await worker.terminate();
    }
    say('Analyse de la recette…', 0.98);
    root.Scanner.lastPages = pages; // utile pour le débogage
    const recipe = root.RecipeParser.parse(pages);
    recipe.photo = photo;
    return recipe;
  }

  // Copie allégée de la photo de la fiche, gardée pour comparer pendant la vérification
  async function compress(file, max = 1100, q = 0.6) {
    const img = await loadImage(file);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }

  root.Scanner = { scan, loadTesseract, compress };
})(this);

// Mini base de connaissances : ingrédients courants -> rayon + unité par défaut.
// Sert à corriger les erreurs de lecture (OCR) et à classer la liste de courses.
(function (root) {
  const R = {
    FL: 'Fruits & légumes',
    HE: 'Herbes & épices',
    VP: 'Viandes & poissons',
    CO: 'Crèmerie & œufs',
    ES: 'Épicerie salée',
    SU: 'Épicerie sucrée',
    BO: 'Boulangerie',
    SG: 'Surgelés',
    BS: 'Boissons',
    AU: 'Autres',
  };

  // [nom, rayon, unité par défaut si la quantité est grande]
  const LIST = [
    // Fruits & légumes
    ['pomme de terre', 'FL'], ['patate douce', 'FL'], ['oignon', 'FL'], ['oignon jaune', 'FL'], ['oignon rouge', 'FL'],
    ['échalote', 'FL'], ['ail', 'FL'], ["gousse d'ail", 'FL'], ['gingembre', 'FL'], ['cébette', 'FL'],
    ['oignon nouveau', 'FL'], ['poireau', 'FL'], ['carotte', 'FL'], ['courgette', 'FL'], ['aubergine', 'FL'],
    ['poivron', 'FL'], ['poivron rouge', 'FL'], ['poivron jaune', 'FL'], ['poivron vert', 'FL'], ['tomate', 'FL'],
    ['tomate cerise', 'FL'], ['concombre', 'FL'], ['salade', 'FL'], ['laitue', 'FL'], ['roquette', 'FL'],
    ['mâche', 'FL'], ['épinard', 'FL', 'g'], ["pousses d'épinard", 'FL', 'g'], ['chou', 'FL'], ['chou-fleur', 'FL'],
    ['brocoli', 'FL'], ['chou rouge', 'FL'], ['chou chinois', 'FL'], ['champignon', 'FL', 'g'], ['champignon de paris', 'FL', 'g'],
    ['céleri', 'FL'], ['céleri-rave', 'FL'], ['fenouil', 'FL'], ['radis', 'FL'], ['betterave', 'FL'],
    ['navet', 'FL'], ['panais', 'FL'], ['potiron', 'FL', 'g'], ['butternut', 'FL'], ['courge', 'FL'],
    ['haricot vert', 'FL', 'g'], ['petits pois', 'FL', 'g'], ['maïs', 'ES', 'g'], ['avocat', 'FL'], ['citron', 'FL'],
    ['citron vert', 'FL'], ['orange', 'FL'], ['pomme', 'FL'], ['poire', 'FL'], ['banane', 'FL'],
    ['fraise', 'FL', 'g'], ['framboise', 'FL', 'g'], ['mangue', 'FL'], ['ananas', 'FL'], ['raisin', 'FL', 'g'],
    ['piment', 'FL'], ['piment rouge', 'FL'], ['pak choï', 'FL'], ['edamame', 'SG', 'g'], ['asperge', 'FL'],
    // Herbes & épices
    ['coriandre', 'HE'], ['persil', 'HE'], ['basilic', 'HE'], ['menthe', 'HE'], ['ciboulette', 'HE'],
    ['aneth', 'HE'], ['thym', 'HE'], ['romarin', 'HE'], ['laurier', 'HE'], ['estragon', 'HE'],
    ['sel', 'HE'], ['poivre', 'HE'], ['paprika', 'HE'], ['cumin', 'HE'], ['curry', 'HE'],
    ['curcuma', 'HE'], ['cannelle', 'HE'], ['muscade', 'HE'], ['piment d\'espelette', 'HE'], ['herbes de provence', 'HE'],
    ['ras el hanout', 'HE'], ['graines de sésame', 'HE', 'g'], ['sésame', 'HE', 'g'], ['origan', 'HE'], ['gingembre en poudre', 'HE'],
    // Viandes & poissons
    ['poulet', 'VP', 'g'], ['haut de cuisse de poulet', 'VP', 'g'], ['filet de poulet', 'VP', 'g'], ['blanc de poulet', 'VP', 'g'], ['cuisse de poulet', 'VP', 'g'],
    ['dinde', 'VP', 'g'], ['bœuf', 'VP', 'g'], ['bœuf haché', 'VP', 'g'], ['steak haché', 'VP'], ['veau', 'VP', 'g'],
    ['porc', 'VP', 'g'], ['filet mignon de porc', 'VP', 'g'], ['échine de porc', 'VP', 'g'], ['agneau', 'VP', 'g'], ['canard', 'VP', 'g'],
    ['magret de canard', 'VP'], ['jambon', 'VP'], ['lardons', 'VP', 'g'], ['chorizo', 'VP', 'g'], ['saucisse', 'VP'],
    ['merguez', 'VP'], ['saumon', 'VP', 'g'], ['pavé de saumon', 'VP'], ['cabillaud', 'VP', 'g'], ['colin', 'VP', 'g'],
    ['thon', 'VP', 'g'], ['crevette', 'VP', 'g'], ['moules', 'VP', 'g'], ['truite', 'VP', 'g'], ['lieu', 'VP', 'g'],
    ['tofu', 'CO', 'g'],
    // Crèmerie & œufs
    ['œuf', 'CO'], ['beurre', 'CO', 'g'], ['lait', 'CO', 'ml'], ['crème fraîche', 'CO', 'ml'], ['crème liquide', 'CO', 'ml'],
    ['crème épaisse', 'CO', 'g'], ['yaourt', 'CO'], ['yaourt grec', 'CO', 'g'], ['fromage blanc', 'CO', 'g'], ['fromage râpé', 'CO', 'g'],
    ['emmental', 'CO', 'g'], ['comté', 'CO', 'g'], ['parmesan', 'CO', 'g'], ['mozzarella', 'CO', 'g'], ['burrata', 'CO'],
    ['feta', 'CO', 'g'], ['chèvre', 'CO', 'g'], ['ricotta', 'CO', 'g'], ['mascarpone', 'CO', 'g'], ['cheddar', 'CO', 'g'],
    ['raclette', 'CO', 'g'], ['reblochon', 'CO'], ['crème de coco', 'ES', 'ml'],
    // Épicerie salée
    ['lait de coco', 'ES', 'ml'], ['sauce curry rouge', 'ES', 'g'], ['pâte de curry rouge', 'ES', 'g'], ['pâte de curry vert', 'ES', 'g'], ['sauce soja', 'ES', 'ml'],
    ['huile', 'ES', 'ml'], ["huile d'olive", 'ES', 'ml'], ['huile de cuisson', 'ES', 'ml'], ['huile de sésame', 'ES', 'ml'], ['vinaigre', 'ES', 'ml'],
    ['vinaigre balsamique', 'ES', 'ml'], ['moutarde', 'ES', 'g'], ['mayonnaise', 'ES', 'g'], ['ketchup', 'ES', 'g'], ['riz', 'ES', 'g'],
    ['riz basmati', 'ES', 'g'], ['riz thaï', 'ES', 'g'], ['pâtes', 'ES', 'g'], ['spaghetti', 'ES', 'g'], ['penne', 'ES', 'g'],
    ['tagliatelles', 'ES', 'g'], ['nouilles', 'ES', 'g'], ['nouilles de riz', 'ES', 'g'], ['semoule', 'ES', 'g'], ['boulgour', 'ES', 'g'],
    ['quinoa', 'ES', 'g'], ['lentilles', 'ES', 'g'], ['lentilles corail', 'ES', 'g'], ['pois chiches', 'ES', 'g'], ['haricots rouges', 'ES', 'g'],
    ['farine', 'SU', 'g'], ['fécule de maïs', 'ES', 'g'], ['maïzena', 'ES', 'g'], ['bouillon de volaille', 'ES', 'ml'], ['bouillon de légumes', 'ES', 'ml'],
    ['cube de bouillon', 'ES'], ['concentré de tomate', 'ES', 'g'], ['coulis de tomate', 'ES', 'g'], ['passata', 'ES', 'g'], ['tomates concassées', 'ES', 'g'],
    ['olives', 'ES', 'g'], ['câpres', 'ES', 'g'], ['cornichons', 'ES', 'g'], ['pesto', 'ES', 'g'], ['tahini', 'ES', 'g'],
    ['cacahuètes', 'ES', 'g'], ['noix de cajou', 'ES', 'g'], ['amandes', 'ES', 'g'], ['noix', 'ES', 'g'], ['pignons de pin', 'ES', 'g'],
    ['chapelure', 'ES', 'g'], ['vin blanc', 'BS', 'ml'], ['vin rouge', 'BS', 'ml'], ['sauce nuoc-mâm', 'ES', 'ml'], ['sauce teriyaki', 'ES', 'ml'],
    ['sauce sriracha', 'ES', 'ml'], ['sauce barbecue', 'ES', 'ml'], ['sauce tomate', 'ES', 'g'],
    // Épicerie sucrée
    ['sucre', 'SU', 'g'], ['sucre roux', 'SU', 'g'], ['sucre glace', 'SU', 'g'], ['miel', 'SU', 'g'], ['sirop d\'érable', 'SU', 'ml'],
    ['chocolat', 'SU', 'g'], ['chocolat noir', 'SU', 'g'], ['cacao', 'SU', 'g'], ['levure chimique', 'SU', 'g'], ['sucre vanillé', 'SU'],
    ['extrait de vanille', 'SU', 'ml'], ['flocons d\'avoine', 'SU', 'g'], ['confiture', 'SU', 'g'], ['poudre d\'amande', 'SU', 'g'],
    // Boulangerie
    ['pain', 'BO'], ['baguette', 'BO'], ['pain burger', 'BO'], ['pain pita', 'BO'], ['tortilla', 'BO'],
    ['wrap', 'BO'], ['pâte feuilletée', 'CO'], ['pâte brisée', 'CO'], ['pâte à pizza', 'CO'], ['naan', 'BO'],
  ];

  function norm(s) {
    return (s || '').toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’`]/g, "'");
  }
  // "Pommes de terre" et "pomme de terre" -> même clé
  function key(s) {
    return norm(s).replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean)
      .map(w => (w.length > 3 ? w.replace(/(s|x)$/, '') : w)).join(' ');
  }
  function squash(s) { return key(s).replace(/[^a-z]/g, ''); }

  const ENTRIES = LIST.map(([nom, r, unite]) => ({ nom, rayon: R[r], unite: unite || '', k: key(nom), sq: squash(nom) }));

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  // Trouve l'ingrédient connu le plus proche d'un nom (éventuellement mal lu).
  // Retourne { entry, score, exact, clean } — clean = le nom lu contient l'entrée mot pour mot.
  function match(raw) {
    const k = key(raw), sq = squash(raw);
    if (sq.length < 2) return null;
    let best = null, bestFz = null;
    for (const e of ENTRIES) {
      let score = 0, clean = false;
      if (e.k === k) { score = 1; clean = true; }
      else {
        const re = new RegExp('(^| )' + e.k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)');
        if (re.test(k)) { score = 0.6 + 0.4 * (e.sq.length / sq.length); clean = true; }
        else if (e.sq.length >= 4 && sq.includes(e.sq)) { score = 0.55 + 0.4 * (e.sq.length / sq.length); }
        const fz = 1 - lev(sq, e.sq) / Math.max(sq.length, e.sq.length);
        if (fz >= 0.8 && (!bestFz || fz > bestFz.score)) bestFz = { entry: e, score: fz, clean: false, exact: false };
        if (fz > score && fz >= 0.72) { score = fz; clean = false; }
      }
      if (score > 0 && (!best || score > best.score || (score === best.score && e.sq.length > best.entry.sq.length))) {
        best = { entry: e, score, clean, exact: score === 1 };
      }
    }
    if (best && !best.exact && bestFz && bestFz.entry.sq.length > best.entry.sq.length && bestFz.score >= 0.8) best = bestFz;
    return best && best.score >= 0.6 ? best : null;
  }

  const api = { RAYONS: Object.values(R), match, key, norm, lev };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IngredientsDB = api;
})(this);

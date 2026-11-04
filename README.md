# Recette

Web app mobile pour **scanner ses fiches recettes**, **planifier ses repas de la semaine**, obtenir sa **liste de courses** automatiquement, et mettre ses repas dans son **calendrier avec des rappels**.

## Fonctionnalités

- **Scanner** : photo du recto et du verso d'une fiche. L'app lit le texte et en tire le titre, les portions (2 à 6 personnes), les temps, les kcal, les ingrédients avec leurs quantités, les étapes, les ustensiles et l'astuce.
- **Vérification** : les lignes douteuses sont surlignées en orange et tout se corrige avant d'enregistrer.
- **Mes recettes** : recherche par titre ou ingrédient, quantités recalculées selon le nombre de personnes, étapes à barrer pendant la cuisine.
- **Ma semaine** : un plat par jour, midi et/ou soir, avec le nombre de personnes.
- **Courses** : la liste est calculée depuis la semaine. Les quantités identiques sont additionnées, classées par rayon et cochables. On peut ajouter des articles à la main et envoyer la liste vers Notes ou une messagerie.
- **Calendrier** : un fichier `.ics` met chaque repas dans le calendrier du téléphone (iPhone ou Google Agenda). L'événement commence quand il faut se mettre en cuisine, avec une alarme.
- **Hors ligne et installable** sur l'écran d'accueil (PWA). Sauvegarde et restauration au format JSON.

## La « mini-IA » de lecture

Aucune API payante et aucun compte : tout tourne **dans le téléphone**.

1. **Prétraitement de l'image** (`js/scan.js`) : niveaux de gris puis seuillage adaptatif, pour supprimer les fonds colorés, les ombres et les reflets.
2. **Reconnaissance de texte** par [Tesseract.js](https://github.com/naptha/tesseract.js), un moteur OCR open source (licence Apache 2.0) avec le modèle de langue française. Il est téléchargé une seule fois (~5 Mo), puis gardé en cache.
3. **Deuxième lecture ciblée** du tableau des ingrédients, ligne par ligne.
4. **Analyseur de recettes** (`js/parser.js`) : repère les sections, reconstruit les lignes du tableau à partir de la position des mots, corrige les erreurs de lecture classiques (séparateurs `|` lus comme `1`, `3`↔`8`, « 1a3 » → « 1 à 3 », etc.) et vérifie que les quantités augmentent avec le nombre de personnes.
5. **Dictionnaire d'ingrédients** (`js/ingredients-db.js`) : environ 250 ingrédients courants, reconnus même mal orthographiés grâce à une recherche floue (distance de Levenshtein). Il donne aussi le rayon du magasin et l'unité probable (g, ml…).

Aucune photo ne quitte le téléphone.

## Données

Tout est enregistré dans le navigateur du téléphone (`localStorage`). Pense à **exporter une sauvegarde** de temps en temps (Réglages → Exporter).

## Développement

Site statique, sans étape de build : il suffit de servir le dossier.

```bash
python3 -m http.server 8000
```

Mise en ligne : GitHub Pages (Settings → Pages → *Deploy from a branch* → `main` / `root`).

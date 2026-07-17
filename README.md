# MASTER-TTS

Pipeline de génération audio (Google Cloud Text-to-Speech) et de flux RSS podcast pour les
articles de blog du groupe Cœur Historique. Décisions actées le 16/07/2026 (session Claude Code
sur `Coeur-Historique/myselion4nonprofit`, voir `docs/tts/` sur ce dépôt) :

- **Moteur** : Google Cloud TTS (projet `MASTER-TTS`), voix **Studio, un seul locuteur
  (narration), voix féminine** (précisé le 17/07/2026), français d'abord. `edge-tts`
  (testé le 09/07/2026) écarté — voix jugée robotique.
- **Plafond auto-imposé** : 1 000 000 caractères/mois, suivi dans `usage/<AAAA-MM>.json`.
- **Stockage** : ce repo — `audio/<uuid-v7>.mp3` (l'UUID sert aussi de `<guid>` RSS).
- **Diffusion** : flux `feed.xml` auto-hébergé, soumis **manuellement une seule fois** à
  Spotify for Creators / Apple Podcasts / Google Podcasts (pas d'API par épisode).

## Avant le premier épisode réel — à faire

1. **Confirmer le genre de la voix Studio en français** : deux voix Studio existent en `fr-FR` —
   `fr-FR-Studio-A` (valeur par défaut du script) et `fr-FR-Studio-D`. Leur `ssmlGender` respectif
   n'a **pas pu être confirmé par la documentation** (page officielle Google inaccessible en
   lecture directe le 17/07/2026, recherche web inconclusive) — seule l'API elle-même fait foi :
   ```
   GOOGLE_TTS_SA_KEY_B64=... npm run list-voices -- --language fr-FR --type Studio
   ```
   Choisir celle marquée `FEMALE` (décision actée : voix féminine) et ajuster `DEFAULT_VOICE`
   dans `scripts/lib/tts.mjs` si ce n'est pas `fr-FR-Studio-A`. Détail : `docs/tts/1-contexte.md`
   sur `myselion4nonprofit`.
2. **Poser les secrets GitHub Actions sur CE repo** (Settings → Secrets and variables → Actions) :
   - `GOOGLE_TTS_SA_KEY_B64` — la clé de compte de service (JSON encodé en base64 : télécharger
     la clé JSON depuis Google Cloud Console, `base64 -w0 fichier.json` sous Linux, coller le
     résultat comme valeur du secret — voir procédure complète dans `docs/tts/1-contexte.md` sur
     `myselion4nonprofit`). Créée le 16/07/2026 mais son emplacement exact (posée ici ou
     seulement sur `myselion4nonprofit`) n'a pas été reconfirmé dans cette session — à vérifier
     avant le premier `workflow_dispatch`.
   - `ARTICLE_SOURCE_TOKEN` — un PAT fine-grained en lecture seule (scope `Contents`), limité au
     repo `Coeur-Historique/myselion4nonprofit`, pour que le workflow puisse aller lire le
     fichier `.mdx` de l'article (le `GITHUB_TOKEN` par défaut n'a accès qu'à ce repo-ci).
3. **Vérifier la limite réelle de caractères par requête** pour une voix Studio : le script
   découpe le texte en segments de 900 caractères (`MAX_CHUNK_CHARS`, `scripts/lib/text.mjs`),
   valeur prudente jamais confirmée avec ce compte — si le premier appel réel renvoie une erreur
   400, ajuster cette constante.

## Utilisation

```
node scripts/generate-episode.mjs \
  --title "Titre de l'article" \
  --file chemin/vers/article.fr.mdx \
  --article-url https://coeur-historique.be/fr/blog/mon-article \
  --site-url https://coeur-historique.be \
  --description "résumé court (optionnel)" \
  --voice fr-FR-Studio-A
```

Nécessite `GOOGLE_TTS_SA_KEY_B64` dans l'environnement et `ffmpeg` installé. Génère
`audio/<uuid>.mp3`, met à jour `feed-episodes.json` (source de vérité) et régénère `feed.xml`
en entier. Refuse et s'arrête si le plafond mensuel de 1M caractères serait dépassé.

Le workflow `.github/workflows/generate-episode.yml` fait la même chose via
`workflow_dispatch`, en récupérant l'article directement depuis `myselion4nonprofit`.

## Structure

- `scripts/generate-episode.mjs` — pipeline complet (CLI).
- `scripts/list-voices.mjs` — liste les voix Google Cloud TTS disponibles pour une langue.
- `scripts/lib/` — modules (auth Google, nettoyage Markdown/MDX, appel API + concaténation
  ffmpeg, suivi du plafond, génération RSS). Zéro dépendance npm ajoutée (Node natif uniquement).
- `audio/` — fichiers `.mp3` générés (créé au premier épisode).
- `feed-episodes.json` / `feed.xml` — flux podcast (créés au premier épisode).
- `usage/` — rapport de consommation par mois calendaire (créé au premier épisode).

## Non résolu / hors périmètre de ce script

- Le repo GitHub `automated/tts-samples` (échantillons `edge-tts`) sur `myselion4nonprofit`
  reste à nettoyer manuellement (suppression de branche bloquée depuis Claude Code, 403).
- Durée des épisodes (`itunes:duration`) non calculée — nécessiterait `ffprobe`, pas installé
  par défaut dans le workflow actuel.

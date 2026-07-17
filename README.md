# MASTER-TTS

Pipeline de génération audio (Google Cloud Text-to-Speech) et de flux RSS podcast pour les
articles de blog du groupe Cœur Historique. Décisions actées le 16/07/2026 (session Claude Code
sur `Coeur-Historique/myselion4nonprofit`, voir `docs/tts/` sur ce dépôt) :

- **Moteur** : Google Cloud TTS (projet `MASTER-TTS`), voix **`fr-FR-Chirp3-HD-Aoede`**
  (un seul locuteur, féminine — décision finale du 17/07/2026, après comparaison à l'oreille
  de 17 voix fr-FR réelles : Studio, Chirp-HD, Chirp3-HD). `edge-tts` (testé le 09/07/2026)
  écarté en premier — voix jugée robotique.
- **Plafond auto-imposé** : 1 000 000 caractères/mois, suivi dans `usage/<AAAA-MM>.json`.
- **Stockage** : ce repo — `audio/<uuid-v7>.mp3` (l'UUID sert aussi de `<guid>` RSS).
- **Diffusion** : flux `feed.xml` auto-hébergé, soumis **manuellement une seule fois** à
  Spotify for Creators / Apple Podcasts / Google Podcasts (pas d'API par épisode).

## État — ce qui reste ouvert

- `GOOGLE_TTS_SA_KEY_B64` posé sur CE repo par Laurent le 17/07/2026 (confirmé fonctionnel,
  17 synthèses réelles réussies). Son ancienne copie sur `myselion4nonprofit` (créée le
  16/07/2026, avant que ce repo n'existe) n'est plus utilisée par aucun workflow — orpheline,
  à supprimer là-bas si elle y traîne encore.
- `ARTICLE_SOURCE_TOKEN` — un PAT fine-grained en lecture seule (scope `Contents`), limité au
  repo `Coeur-Historique/myselion4nonprofit`, **pas encore créé** — nécessaire uniquement pour
  déclencher `generate-episode.yml` via `workflow_dispatch` (les tests réels à ce jour sont
  passés par une exécution locale directe, pas par ce workflow).
- Limite de caractères par requête pour Chirp3-HD : jamais atteinte en pratique (segments de
  900 caractères, `MAX_CHUNK_CHARS` dans `scripts/lib/text.mjs`) — aucune erreur 400 rencontrée
  sur les 17 tests réels du 17/07/2026, mais la vraie limite officielle reste non confirmée.

## Utilisation

```
node scripts/generate-episode.mjs \
  --title "Titre de l'article" \
  --file chemin/vers/article.fr.mdx \
  --article-url https://coeur-historique.be/fr/blog/mon-article \
  --site-url https://coeur-historique.be \
  --description "résumé court (optionnel)" \
  --voice fr-FR-Chirp3-HD-Aoede
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

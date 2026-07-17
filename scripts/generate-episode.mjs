#!/usr/bin/env node
// scripts/generate-episode.mjs
// Pipeline complet : article (Markdown/MDX) -> audio (Google Cloud TTS, voix Studio) -> episode
// ajoute a feed.xml. Decisions actees le 16/07/2026 (voir myselion4nonprofit, docs/tts/) :
// - Moteur : Google Cloud TTS, voix Studio, narration un seul locuteur, francais d'abord.
// - Plafond auto-impose : 1M caracteres/mois (voir lib/usage.mjs), refuse au-dela.
// - Stockage : ce repo (MASTER-TTS), audio/<uuid-v7>.mp3 -- l'UUID sert aussi de <guid> RSS.
// - Flux RSS auto-heberge (feed.xml), soumis manuellement une fois a Spotify/Apple/Google.
//
// Usage :
//   node scripts/generate-episode.mjs \
//     --title "Titre de l'article" \
//     --file chemin/vers/article.fr.mdx \
//     --article-url https://coeur-historique.be/fr/blog/mon-article \
//     --site-url https://coeur-historique.be \
//     [--description "résumé court"] [--voice fr-FR-Studio-A]
//
// Nécessite : GOOGLE_TTS_SA_KEY_B64 dans l'environnement, ffmpeg installé sur la machine/le
// runner (voir .github/workflows/generate-episode.yml).

import { readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { uuidv7 } from './lib/uuid.mjs';
import { getAccessToken } from './lib/google-auth.mjs';
import { markdownToNarration, chunkText } from './lib/text.mjs';
import { checkBudget, recordUsage } from './lib/usage.mjs';
import { synthesizeSegment, concatMp3Buffers, DEFAULT_VOICE } from './lib/tts.mjs';
import { addEpisode } from './lib/rss.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['title', 'file', 'article-url', 'site-url'];
  const missing = required.filter((k) => !args[k]);
  if (missing.length) {
    console.error(`Arguments manquants : ${missing.map((m) => `--${m}`).join(', ')}`);
    process.exit(1);
  }

  const voice = args.voice
    ? { languageCode: args.language || DEFAULT_VOICE.languageCode, name: args.voice }
    : DEFAULT_VOICE;

  const raw = await readFile(args.file, 'utf-8');
  const bodyNarration = markdownToNarration(raw);
  if (!bodyNarration) {
    console.error("Aucun texte exploitable après nettoyage Markdown/MDX -- fichier vide ?");
    process.exit(1);
  }
  // Le titre (frontmatter, passé explicitement via --title) est lu une seule fois, en tête --
  // jamais déduit du corps (le H1 du corps est retiré par markdownToNarration pour éviter la
  // répétition). Cible spécifiquement "titre + contenu", pas la page entière.
  const narration = `${args.title}. ${bodyNarration}`;
  const characters = narration.length;

  const { ok, remaining } = await checkBudget(REPO_ROOT, characters);
  if (!ok) {
    console.error(
      `Refusé : ${characters} caractères demandés, ${remaining} restants ce mois-ci ` +
      `(plafond auto-imposé ${1_000_000}/mois). Attendre le mois suivant ou ajuster le plafond ` +
      `avec Laurent avant de continuer.`
    );
    process.exit(1);
  }

  console.log(`Synthèse de ${characters} caractères, voix ${voice.name} (${voice.languageCode})...`);
  const chunks = chunkText(narration);
  console.log(`${chunks.length} segment(s) à synthétiser.`);

  const { accessToken, projectId } = await getAccessToken();
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  segment ${i + 1}/${chunks.length} (${chunks[i].length} caractères)`);
    buffers.push(await synthesizeSegment(accessToken, projectId, chunks[i], voice));
  }

  const uuid = uuidv7();
  const audioDir = path.join(REPO_ROOT, 'audio');
  await mkdir(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, `${uuid}.mp3`);
  await concatMp3Buffers(buffers, audioPath);
  const { size: audioBytes } = await stat(audioPath);

  await recordUsage(REPO_ROOT, { episodeUuid: uuid, title: args.title, characters });

  const episode = {
    uuid,
    title: args.title,
    description: args.description || '',
    articleUrl: args['article-url'],
    // jsDelivr, pas raw.githubusercontent.com : ce dernier renvoie systematiquement
    // Content-Disposition: attachment (verifie le 17/07/2026), forcant le telechargement au
    // lieu de la lecture inline -- casse un <audio controls>/lien "Ecouter". jsDelivr sert le
    // contenu d'un repo GitHub public sans ce header.
    audioUrl: `https://cdn.jsdelivr.net/gh/Coeur-Historique/MASTER-TTS@main/audio/${uuid}.mp3`,
    audioBytes,
    publishedAt: new Date().toISOString(),
    durationSeconds: null, // ffprobe non installé par défaut -- à calculer si besoin réel
  };
  await addEpisode(
    path.join(REPO_ROOT, 'feed-episodes.json'),
    path.join(REPO_ROOT, 'feed.xml'),
    episode,
    { siteUrl: args['site-url'] }
  );

  console.log(`\nOK — audio/${uuid}.mp3 (${audioBytes} octets), feed.xml mis à jour.`);
  console.log(`Caractères consommés ce mois : voir usage/ (rapport après-génération).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

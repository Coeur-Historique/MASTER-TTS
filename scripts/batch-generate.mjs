#!/usr/bin/env node
// One-off batch driver for the July 2026 "generate everything missing" push. Not part of the
// public CLI surface (see generate-episode.mjs for the real one-article-at-a-time entrypoint) --
// reuses the same lib functions directly so each article's frontmatter can be patched with the
// resulting audioUrl right after synthesis, without a separate manual edit step per locale.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { uuidv7 } from './lib/uuid.mjs';
import { getAccessToken } from './lib/google-auth.mjs';
import { markdownToNarration, chunkText } from './lib/text.mjs';
import { checkBudget, recordUsage } from './lib/usage.mjs';
import { synthesizeSegment, concatMp3Buffers } from './lib/tts.mjs';
import { addEpisode } from './lib/rss.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BLOG_DIR = '/home/user/myselion4nonprofit/src/content/blog';
const SITE_URL = 'https://coeur-historique.be';

const VOICE_BY_LOCALE = {
  fr: { name: 'fr-FR-Chirp3-HD-Aoede', languageCode: 'fr-FR' },
  en: { name: 'en-US-Chirp3-HD-Aoede', languageCode: 'en-US' },
  nl: { name: 'nl-BE-Chirp3-HD-Aoede', languageCode: 'nl-BE' },
  de: { name: 'de-DE-Chirp3-HD-Aoede', languageCode: 'de-DE' },
};

function extractFrontmatterField(raw, field) {
  const re = new RegExp(`^${field}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm');
  const m = raw.match(re);
  if (!m) return null;
  return m[1].replace(/\\"/g, '"');
}

async function processOne(slug, locale) {
  const file = path.join(BLOG_DIR, `${slug}.${locale}.mdx`);
  const raw = await readFile(file, 'utf-8');
  if (/^audioUrl:/m.test(raw)) {
    console.log(`SKIP ${slug}.${locale} -- audioUrl déjà présent`);
    return;
  }
  const title = extractFrontmatterField(raw, 'title');
  const description = extractFrontmatterField(raw, 'description');
  if (!title) throw new Error(`Titre introuvable dans ${file}`);
  const voice = VOICE_BY_LOCALE[locale];
  const articleUrl = `${SITE_URL}/${locale}/blog/${slug}`;

  const bodyNarration = markdownToNarration(raw);
  if (!bodyNarration) throw new Error(`Aucun texte exploitable dans ${file}`);
  const narration = `${title}. ${bodyNarration}`;
  const characters = narration.length;

  const { ok, remaining } = await checkBudget(REPO_ROOT, characters);
  if (!ok) {
    throw new Error(`Budget dépassé : ${characters} demandés, ${remaining} restants.`);
  }

  console.log(`-> ${slug}.${locale} : ${characters} caractères, voix ${voice.name}`);
  const chunks = chunkText(narration);
  const { accessToken, projectId } = await getAccessToken();
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    buffers.push(await synthesizeSegment(accessToken, projectId, chunks[i], voice));
  }

  const uuid = uuidv7();
  const audioDir = path.join(REPO_ROOT, 'audio');
  await mkdir(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, `${uuid}.mp3`);
  await concatMp3Buffers(buffers, audioPath);
  const { size: audioBytes } = await stat(audioPath);

  await recordUsage(REPO_ROOT, { episodeUuid: uuid, title, characters });

  const audioUrl = `https://cdn.jsdelivr.net/gh/Coeur-Historique/MASTER-TTS@main/audio/${uuid}.mp3`;
  const episode = {
    uuid,
    title,
    description: description || '',
    articleUrl,
    audioUrl,
    audioBytes,
    publishedAt: new Date().toISOString(),
    durationSeconds: null,
  };
  await addEpisode(
    path.join(REPO_ROOT, 'feed-episodes.json'),
    path.join(REPO_ROOT, 'feed.xml'),
    episode,
    { siteUrl: SITE_URL }
  );

  const patched = raw.replace(/\n---\n/, `\naudioUrl: "${audioUrl}"\n---\n`);
  await writeFile(file, patched, 'utf-8');

  console.log(`   OK -- audio/${uuid}.mp3 (${audioBytes} octets) -- frontmatter mis à jour`);
}

async function main() {
  const slug = process.argv[2];
  const locales = process.argv[3] ? process.argv[3].split(',') : ['fr', 'en', 'nl', 'de'];
  for (const locale of locales) {
    await processOne(slug, locale);
  }
}

main().catch((err) => {
  console.error('ÉCHEC:', err.message || err);
  process.exit(1);
});

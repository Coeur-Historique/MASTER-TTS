// scripts/lib/rss.mjs
// Flux RSS podcast (RSS 2.0 + namespace iTunes), auto-heberge dans ce repo -- decision actee
// le 16/07/2026 : soumission manuelle unique du flux a Spotify for Creators/Apple/Google, pas
// d'API par episode. Source de verite = feed-episodes.json (liste des episodes) ; feed.xml est
// entierement regenere a partir de ce fichier a chaque episode ajoute (jamais edite a la main).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const FEED_TITLE = 'Cœur Historique — Le Blog en Podcast';
const FEED_DESCRIPTION = "Les articles du blog de l'ASBL Cœur Historique, lus à voix haute.";
const FEED_LANGUAGE = 'fr-be';

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderItem(ep) {
  return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description || '')}</description>
      <link>${escapeXml(ep.articleUrl)}</link>
      <guid isPermaLink="false">${escapeXml(ep.uuid)}</guid>
      <pubDate>${new Date(ep.publishedAt).toUTCString()}</pubDate>
      <enclosure url="${escapeXml(ep.audioUrl)}" length="${ep.audioBytes}" type="audio/mpeg" />
      <itunes:duration>${ep.durationSeconds ?? ''}</itunes:duration>
    </item>`;
}

export function renderFeedXml(episodes, { siteUrl }) {
  const items = episodes.map(renderItem).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>${FEED_LANGUAGE}</language>
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>
`;
}

export async function loadEpisodes(episodesJsonPath) {
  if (!existsSync(episodesJsonPath)) return [];
  return JSON.parse(await readFile(episodesJsonPath, 'utf-8'));
}

// Ajoute (ou remplace, si meme uuid re-genere) un episode, puis reecrit feed-episodes.json et
// feed.xml -- le plus recent en tete (meme convention que 3-journal.md).
export async function addEpisode(episodesJsonPath, feedXmlPath, episode, opts) {
  const episodes = (await loadEpisodes(episodesJsonPath)).filter((e) => e.uuid !== episode.uuid);
  episodes.unshift(episode);
  await writeFile(episodesJsonPath, JSON.stringify(episodes, null, 2) + '\n', 'utf-8');
  await writeFile(feedXmlPath, renderFeedXml(episodes, opts), 'utf-8');
  return episodes;
}

// scripts/lib/usage.mjs
// Suivi du plafond auto-impose de 1M caracteres/mois (decision actee le 16/07/2026, voir
// docs/tts/ sur myselion4nonprofit). Un fichier usage/<AAAA-MM>.json par mois calendaire,
// jamais purge -- sert aussi de rapport apres chaque generation.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const MONTHLY_CAP = 1_000_000;

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function usagePath(root, date = new Date()) {
  return path.join(root, 'usage', `${monthKey(date)}.json`);
}

async function loadUsage(root, date = new Date()) {
  const file = usagePath(root, date);
  if (!existsSync(file)) {
    return { month: monthKey(date), totalCharacters: 0, episodes: [] };
  }
  return JSON.parse(await readFile(file, 'utf-8'));
}

export async function checkBudget(root, charactersNeeded, date = new Date()) {
  const usage = await loadUsage(root, date);
  const remaining = MONTHLY_CAP - usage.totalCharacters;
  return { ok: charactersNeeded <= remaining, remaining, usage };
}

export async function recordUsage(root, { episodeUuid, title, characters }, date = new Date()) {
  const usage = await loadUsage(root, date);
  usage.totalCharacters += characters;
  usage.episodes.push({
    uuid: episodeUuid,
    title,
    characters,
    generatedAt: date.toISOString(),
  });
  const file = usagePath(root, date);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(usage, null, 2) + '\n', 'utf-8');
  return usage;
}

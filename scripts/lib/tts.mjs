// scripts/lib/tts.mjs
// Appel de l'API Google Cloud Text-to-Speech (REST, v1) -- voix Studio, narration, decision
// actee le 16/07/2026. Chaque segment (voir text.mjs) est synthetise separement puis concatene
// avec ffmpeg (meme approche que l'ancien tts-sample-test.yml, deja eprouvee) car l'API ne
// prend qu'un texte borne par requete.

import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SYNTHESIZE_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

// Decision finale (17/07/2026, Laurent) : apres comparaison a l'oreille de 17 voix feminines
// fr-FR (Studio + Chirp-HD + Chirp3-HD, toutes testees en conditions reelles sur un vrai
// article), voix retenue = Chirp3-HD "Aoede". Genre confirme FEMALE via l'API reelle
// (`npm run list-voices -- --language fr-FR --type Chirp`).
export const DEFAULT_VOICE = {
  languageCode: 'fr-FR',
  name: 'fr-FR-Chirp3-HD-Aoede',
};

export async function synthesizeSegment(accessToken, projectId, text, voice = DEFAULT_VOICE) {
  const res = await fetch(SYNTHESIZE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
      ...(projectId ? { 'X-Goog-User-Project': projectId } : {}),
    },
    body: JSON.stringify({
      input: { text },
      voice,
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  if (!res.ok) {
    throw new Error(`Cloud TTS a refusé le segment (${res.status}) : ${await res.text()}`);
  }
  const data = await res.json();
  return Buffer.from(data.audioContent, 'base64');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} a échoué (code ${code})`))));
  });
}

// Concatene une liste de buffers MP3 en un seul fichier, via ffmpeg (doit être installé sur la
// machine/le runner -- voir .github/workflows/generate-episode.yml).
export async function concatMp3Buffers(buffers, outputPath) {
  const tmpDir = await import('node:fs/promises').then((fs) => fs.mkdtemp(path.join(os.tmpdir(), 'tts-')));
  const segmentPaths = [];
  for (let i = 0; i < buffers.length; i++) {
    const p = path.join(tmpDir, `seg-${String(i).padStart(3, '0')}.mp3`);
    await writeFile(p, buffers[i]);
    segmentPaths.push(p);
  }
  const listPath = path.join(tmpDir, 'concat.txt');
  await writeFile(listPath, segmentPaths.map((p) => `file '${p}'`).join('\n'), 'utf-8');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
  await Promise.all(segmentPaths.map((p) => unlink(p)));
  await unlink(listPath);
}

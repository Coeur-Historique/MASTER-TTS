#!/usr/bin/env node
// scripts/list-voices.mjs
// Liste les voix Google Cloud TTS disponibles pour une langue -- a lancer AVANT le premier
// generate-episode.mjs reel pour confirmer le nom exact d'une voix "Studio" en fr-FR (jamais
// verifie en conditions reelles avec ce compte de service au moment de l'ecriture du pipeline).
//
// Usage : node scripts/list-voices.mjs --language fr-FR
//         node scripts/list-voices.mjs --language fr-FR --type Studio

import { getAccessToken } from './lib/google-auth.mjs';

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

const args = parseArgs(process.argv.slice(2));
const language = args.language || 'fr-FR';

const { accessToken, projectId } = await getAccessToken();
const url = new URL('https://texttospeech.googleapis.com/v1/voices');
url.searchParams.set('languageCode', language);

const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    ...(projectId ? { 'X-Goog-User-Project': projectId } : {}),
  },
});
if (!res.ok) {
  console.error(`Echec de la requête voices.list (${res.status}) :`, await res.text());
  process.exit(1);
}
const data = await res.json();
let voices = data.voices || [];
if (args.type) {
  voices = voices.filter((v) => v.name.includes(args.type));
}
if (voices.length === 0) {
  console.log(`Aucune voix trouvée pour ${language}${args.type ? ` (filtre "${args.type}")` : ''}.`);
} else {
  for (const v of voices) {
    console.log(`${v.name}\t${v.ssmlGender}\t${v.naturalSampleRateHertz}Hz`);
  }
}

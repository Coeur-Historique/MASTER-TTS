// scripts/lib/google-auth.mjs
// Echange la cle de compte de service Google (JSON, fournie encodee en base64 dans la variable
// d'environnement GOOGLE_TTS_SA_KEY_B64) contre un access token OAuth2, via le flux JWT Bearer
// (RFC 7523) -- signature RS256 en Node natif (node:crypto), zero dependance ajoutee (pas de
// google-auth-library). Scope demande : cloud-platform (suffisant pour Cloud Text-to-Speech).

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadServiceAccount() {
  const b64 = process.env.GOOGLE_TTS_SA_KEY_B64;
  if (!b64) {
    throw new Error(
      'GOOGLE_TTS_SA_KEY_B64 absente de l\'environnement. Ce secret doit être posé sur le ' +
      'repo GitHub coeur-historique/MASTER-TTS (Settings -> Secrets and variables -> Actions), ' +
      'pas seulement sur myselion4nonprofit -- à vérifier si jamais recopié ici.'
    );
  }
  let json;
  try {
    json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  } catch (err) {
    throw new Error(`GOOGLE_TTS_SA_KEY_B64 ne décode pas en JSON valide : ${err.message}`);
  }
  if (!json.private_key || !json.client_email) {
    throw new Error('Clé de compte de service invalide : private_key ou client_email manquant.');
  }
  return json;
}

export async function getAccessToken() {
  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(sa.private_key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Echec d'obtention du token OAuth2 (${res.status}) : ${await res.text()}`);
  }
  const data = await res.json();
  return { accessToken: data.access_token, projectId: sa.project_id };
}

// scripts/lib/uuid.mjs
// UUID v7 (RFC 9562) -- meme generateur que myselion4nonprofit/docs/script/generate-uuid.mjs,
// duplique ici (zero dependance) car ce repo est distinct. Sert de nom de fichier audio et de
// <guid> RSS (voir myselion4nonprofit/.claude/commands/open.md § "UUID stable").

import { randomBytes } from 'node:crypto';

export function uuidv7() {
  const ts = BigInt(Date.now());
  const bytes = randomBytes(16);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 9562
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

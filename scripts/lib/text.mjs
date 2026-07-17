// scripts/lib/text.mjs
// Nettoyage minimal Markdown/MDX -> texte de narration brut, et decoupage en segments sous
// une limite de caracteres (Google Cloud TTS refuse une requete "text" trop longue -- la limite
// exacte varie selon le type de voix ; voir MAX_CHUNK_CHARS ci-dessous).

// Les voix "Studio" de Google Cloud TTS ont, dans les tests connus au moment de l'ecriture de
// ce script, une limite d'entree plus basse que les voix standard/Neural2 (5000 octets) --
// valeur prudente ici, JAMAIS verifiee en conditions reelles avec ce compte de service.
// Si le premier vrai appel renvoie une erreur 400 (INVALID_ARGUMENT, texte trop long), reduire
// cette constante et documenter la vraie limite dans docs/tts/1-contexte.md (myselion4nonprofit).
export const MAX_CHUNK_CHARS = 900;

export function stripFrontmatter(raw) {
  if (raw.startsWith('---\n')) {
    const end = raw.indexOf('\n---', 4);
    if (end !== -1) return raw.slice(end + 4).trimStart();
  }
  return raw;
}

export function markdownToNarration(markdown) {
  let text = stripFrontmatter(markdown);
  text = text.replace(/```[\s\S]*?```/g, ' ');       // blocs de code
  text = text.replace(/`([^`]+)`/g, '$1');            // code inline
  text = text.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');   // images
  text = text.replace(/\[([^\]]+)]\([^)]*\)/g, '$1'); // liens -> texte du lien
  text = text.replace(/<[^>]+>/g, ' ');                // balises HTML/JSX (composants MDX)
  text = text.replace(/^#{1,6}\s*/gm, '');             // titres
  text = text.replace(/[*_~]{1,3}/g, '');              // gras/italique/barre
  text = text.replace(/^>\s?/gm, '');                  // citations
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// Decoupe par phrases (jamais au milieu d'un mot), en accumulant jusqu'a MAX_CHUNK_CHARS.
export function chunkText(text, maxChars = MAX_CHUNK_CHARS) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // Phrase elle-meme trop longue (rare) : decoupe brute au mot le plus proche.
      if (current) { chunks.push(current); current = ''; }
      let rest = sentence;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(' ', maxChars);
        if (cut <= 0) cut = maxChars;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      current = rest;
      continue;
    }
    if ((current + ' ' + sentence).trim().length > maxChars) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + ' ' + sentence).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

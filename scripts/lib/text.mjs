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

// Convention de redaction (a documenter formellement cote articles de blog, voir echange du
// 17/07/2026) : tout ce qui suit ce marqueur dans le corps du .mdx est ignore par la narration
// -- sert a exclure les sections non destinees a etre lues a voix haute (appel aux benevoles,
// liens de navigation, CTA), qui restent affichees normalement sur le site.
// IMPORTANT : syntaxe JSX {/* ... */}, PAS un commentaire HTML <!-- ... -->. Constate le
// 17/07/2026 en verifiant le rendu local avant deploiement : MDX interprete <...> comme du JSX
// et `<!-- tts:stop -->` casse la compilation (MDXError "Unexpected character `!`"). Un
// commentaire HTML classique reste syntaxiquement invalide en corps de fichier .mdx.
const TTS_STOP_MARKER = /\{\/\*\s*tts:stop\s*\*\/\}/i;

export function truncateAtStopMarker(text) {
  const match = text.match(TTS_STOP_MARKER);
  return match ? text.slice(0, match.index) : text;
}

// Nettoie le corps de l'article pour la narration -- le TITRE (frontmatter, passe separement
// par --title) n'est PAS repris ici : le H1 du corps est retire pour eviter de le lire deux fois.
// Cible specifiquement "titre + contenu" (decision du 17/07/2026) : les elements structurels
// purement visuels (lignes de separation ---, emoji) sont retires, jamais lus a voix haute.
export function markdownToNarration(markdown) {
  let text = stripFrontmatter(markdown);
  text = truncateAtStopMarker(text);
  text = text.replace(/```[\s\S]*?```/g, ' ');       // blocs de code
  text = text.replace(/`([^`]+)`/g, '$1');            // code inline
  text = text.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');   // images
  text = text.replace(/\[([^\]]+)]\([^)]*\)/g, '$1'); // liens -> texte du lien (jamais l'URL)
  text = text.replace(/<[^>]+>/g, ' ');                // balises HTML/JSX (composants MDX) restantes
  // Tableaux Markdown : sans ce traitement, une ligne "| cellule | cellule | cellule |" n'a
  // aucune ponctuation de fin de phrase -- chunkText() la laisse alors fusionnee avec le
  // paragraphe voisin en une seule "phrase" gigantesque, que Chirp3-HD refuse (400,
  // "sentences that are too long"), meme sous la limite globale MAX_CHUNK_CHARS. Constate le
  // 18/07/2026 sur un tableau recapitulatif en fin d'article. Fix : ligne de separation
  // (|:---|:---|) retiree, chaque ligne de donnees convertie en phrases ponctuees.
  text = text.replace(/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/gm, '');
  text = text.replace(/^\|(.+)\|$/gm, (_, row) => {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    return cells.length ? `${cells.join('. ')}.` : '';
  });
  text = text.replace(/^#\s+.*$/gm, '');               // H1 entier retire (deja porte par --title)
  text = text.replace(/^#{2,6}\s*/gm, '');             // sous-titres : garde le texte, retire les #
  text = text.replace(/^[ \t]*-{3,}[ \t]*$/gm, '');    // lignes de separation horizontale (---)
  text = text.replace(/[*_~]{1,3}/g, '');              // gras/italique/barre
  text = text.replace(/^>\s?/gm, '');                  // citations
  text = text.replace(/[\u{1F1E6}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}‍]/gu, ''); // emoji
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

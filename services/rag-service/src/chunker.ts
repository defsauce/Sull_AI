const TARGET_CHUNK_SIZE = 500;

export interface TextChunk {
  index: number;
  content: string;
  tokenEstimate: number;
}

export function chunkByParagraphs(content: string, targetSize = TARGET_CHUNK_SIZE): TextChunk[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: TextChunk[] = [];
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length === 0) {
      return;
    }
    chunks.push({
      index: chunks.length,
      content: trimmed,
      tokenEstimate: estimateTokens(trimmed),
    });
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).trim().length <= targetSize) {
      buffer = buffer.length > 0 ? `${buffer}\n\n${paragraph}` : paragraph;
      continue;
    }

    if (buffer.length > 0) {
      flush();
    }

    if (paragraph.length <= targetSize) {
      buffer = paragraph;
      continue;
    }

    for (let offset = 0; offset < paragraph.length; offset += targetSize) {
      const slice = paragraph.slice(offset, offset + targetSize).trim();
      if (slice.length > 0) {
        chunks.push({
          index: chunks.length,
          content: slice,
          tokenEstimate: estimateTokens(slice),
        });
      }
    }
  }

  flush();
  return chunks;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function lexicalScore(query: string, content: string): number {
  const queryTerms = tokenize(query);
  const contentTerms = new Set(tokenize(content));
  if (queryTerms.length === 0) {
    return 0;
  }
  const matches = queryTerms.filter((term) => contentTerms.has(term)).length;
  return matches / queryTerms.length;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
}

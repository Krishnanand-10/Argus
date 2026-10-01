import type { Token, AnalyzerOptions } from './types.js';
import { resolveStopWords } from './stop-words.js';
import { stemWord } from './stemmer.js';
import { filterChars } from './char-filter.js';

/**
 * Tokenizes text and processes each token through the analysis pipeline:
 * 1. Character filtering (HTML strip, Unicode NFKD, diacritics, lowercasing)
 * 2. Word boundary tokenization (Unicode-aware)
 * 3. Length threshold filtering
 * 4. Stopword filtering
 * 5. Stemming (Porter Stemmer)
 */
export function tokenize(text: string, options: AnalyzerOptions = {}): Token[] {
  const {
    stripHtml = false,
    stripDiacritics: shouldStripDiacritics = true,
    lowercase = true,
    stopWords = true,
    stemming = true,
    minTokenLength = 1,
    maxTokenLength = 64,
  } = options;

  // 1. Character Filter
  const filtered = filterChars(text, {
    stripHtml,
    stripDiacritics: shouldStripDiacritics,
    lowercase,
  });

  const stopWordSet = resolveStopWords(stopWords);
  const tokens: Token[] = [];
  let position = 0;

  // 2. Unicode-aware word token matching
  // Matches sequences of Unicode letters, digits, or underscore
  const wordRegex = /[\p{L}\p{N}_]+/gu;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(filtered)) !== null) {
    let term = match[0];
    const startOffset = match.index;
    const endOffset = startOffset + term.length;

    // 3. Length bounds check
    if (term.length < minTokenLength || term.length > maxTokenLength) {
      continue;
    }

    // 4. Stopword filter check
    if (stopWordSet && stopWordSet.has(term)) {
      continue;
    }

    // 5. Porter Stemming
    if (stemming) {
      term = stemWord(term);
    }

    tokens.push({
      term,
      position: position++,
      startOffset,
      endOffset,
    });
  }

  return tokens;
}

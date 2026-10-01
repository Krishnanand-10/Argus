import type { Token, AnalyzerOptions } from './types.js';
import { tokenize } from './tokenizer.js';
import { filterChars, stripDiacritics, stripHtmlTags } from './char-filter.js';
import { stemWord } from './stemmer.js';
import { DEFAULT_STOP_WORDS, resolveStopWords } from './stop-words.js';

export * from './types.js';
export { tokenize, filterChars, stripDiacritics, stripHtmlTags, stemWord, DEFAULT_STOP_WORDS, resolveStopWords };

/**
 * High-performance, configurable Analyzer for document indexing and query normalization.
 */
export class Analyzer {
  private readonly options: AnalyzerOptions;

  constructor(options: AnalyzerOptions = {}) {
    this.options = {
      lowercase: true,
      stripHtml: false,
      stripDiacritics: true,
      stopWords: true,
      stemming: true,
      minTokenLength: 1,
      maxTokenLength: 64,
      ...options,
    };
  }

  /**
   * Analyzes an input document string into a sequence of positional tokens.
   */
  public analyze(text: string): Token[] {
    return tokenize(text, this.options);
  }

  /**
   * Normalizes a single query term (used during query parsing).
   */
  public normalizeTerm(term: string): string {
    let t = term;
    if (this.options.stripDiacritics !== false) {
      t = stripDiacritics(t);
    }
    if (this.options.lowercase !== false) {
      t = t.toLowerCase();
    }
    if (this.options.stemming !== false) {
      t = stemWord(t);
    }
    return t;
  }
}

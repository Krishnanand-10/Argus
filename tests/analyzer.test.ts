import { describe, it, expect } from 'vitest';
import { Analyzer, tokenize, stemWord, stripDiacritics, stripHtmlTags } from '../src/analyzer/index.js';

describe('Text Analysis Pipeline', () => {
  describe('Character Filtering', () => {
    it('strips HTML tags cleanly', () => {
      const input = '<p>Hello <strong>World</strong>!</p>';
      expect(stripHtmlTags(input).trim()).toBe('Hello  World !');
    });

    it('strips accents and diacritics using Unicode NFKD', () => {
      expect(stripDiacritics('café crème')).toBe('cafe creme');
      expect(stripDiacritics('naïve résumé')).toBe('naive resume');
      expect(stripDiacritics('façade')).toBe('facade');
    });
  });

  describe('Porter Stemmer', () => {
    it('correctly stems common English morphological variations', () => {
      expect(stemWord('searching')).toBe('search');
      expect(stemWord('searched')).toBe('search');
      expect(stemWord('searches')).toBe('search');
      expect(stemWord('computer')).toBe('comput');

      expect(stemWord('distributed')).toBe('distribut');
      expect(stemWord('distribution')).toBe('distribut');

      expect(stemWord('systems')).toBe('system');
      expect(stemWord('relational')).toBe('relat');
      expect(stemWord('conditional')).toBe('condit');
      expect(stemWord('operator')).toBe('oper');
    });

    it('preserves very short words', () => {
      expect(stemWord('go')).toBe('go');
      expect(stemWord('in')).toBe('in');
      expect(stemWord('to')).toBe('to');
    });
  });

  describe('Tokenizer & Stopwords', () => {
    it('tokenizes text with correct positions and offsets', () => {
      const tokens = tokenize('High-performance search engines', {
        stopWords: false,
        stemming: false,
      });

      expect(tokens.map((t) => t.term)).toEqual(['high', 'performance', 'search', 'engines']);
      expect(tokens.map((t) => t.position)).toEqual([0, 1, 2, 3]);
      expect(tokens[0]!.startOffset).toBe(0);
      expect(tokens[0]!.endOffset).toBe(4);
    });

    it('eliminates standard English stopwords', () => {
      const tokens = tokenize('The quick brown fox jumps over the lazy dog', {
        stemming: false,
      });

      // 'the', 'over' should be removed
      expect(tokens.map((t) => t.term)).toEqual(['quick', 'brown', 'fox', 'jumps', 'lazy', 'dog']);
    });

    it('applies custom stopword dictionaries', () => {
      const tokens = tokenize('Distributed consensus in database systems', {
        stopWords: ['distributed', 'in'],
        stemming: false,
      });

      expect(tokens.map((t) => t.term)).toEqual(['consensus', 'database', 'systems']);
    });

    it('respects min and max token length bounds', () => {
      const tokens = tokenize('a ab abc abcdefghij', {
        stopWords: false,
        stemming: false,
        minTokenLength: 2,
        maxTokenLength: 5,
      });

      expect(tokens.map((t) => t.term)).toEqual(['ab', 'abc']);
    });
  });

  describe('Analyzer Class', () => {
    it('provides an end-to-end token analysis pipeline', () => {
      const analyzer = new Analyzer();
      const tokens = analyzer.analyze('Fault-tolerant consensus algorithms for distributed databases.');

      // Check stemmed and filtered terms
      const terms = tokens.map((t) => t.term);
      expect(terms).toContain('fault');
      expect(terms).toContain('toler');
      expect(terms).toContain('consensu');
      expect(terms).toContain('algorithm');
      expect(terms).toContain('distribut');
      expect(terms).toContain('databas');
      // 'for' should be eliminated as stopword
      expect(terms).not.toContain('for');
    });

    it('normalizes single query terms accurately', () => {
      const analyzer = new Analyzer();
      expect(analyzer.normalizeTerm('Distributed')).toBe('distribut');
      expect(analyzer.normalizeTerm('Café')).toBe('cafe');
      expect(analyzer.normalizeTerm('Algorithms')).toBe('algorithm');
    });
  });
});

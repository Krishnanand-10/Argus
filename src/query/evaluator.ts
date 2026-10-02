import type { InvertedIndex } from '../index/inverted-index.js';
import { BM25Scorer } from '../ranking/bm25.js';
import type { ScoredDocument } from '../ranking/types.js';
import type { QueryNode, TermNode, FuzzyNode, PhraseNode, PrefixNode, AndNode, OrNode, NotNode } from './ast.js';
import { QueryParser } from './parser.js';

export interface SearchOptions {
  /** Maximum number of top ranked documents to return (default: 10) */
  limit?: number;
  /** Whether to generate keyword highlight snippets (default: true) */
  highlight?: boolean;
  /** Maximum character length of generated snippet (default: 150) */
  snippetLength?: number;
  /** Custom BM25 scorer instance */
  scorer?: BM25Scorer;
  /**
   * Typo tolerance: enable automatic fuzzy search when terms have 0 exact matches (default: true).
   * Can also be a number specifying max edit distance (1 or 2).
   */
  fuzzy?: boolean | number;
}

/**
 * Query Evaluator executes parsed AST query plans against an InvertedIndex,
 * applies Okapi BM25 ranking, and formats highlighted search snippets.
 */
export class QueryEvaluator {
  private readonly parser: QueryParser = new QueryParser();
  private readonly defaultScorer: BM25Scorer = new BM25Scorer();

  /**
   * Executes a search query string against the index.
   */
  public search(
    query: string,
    index: InvertedIndex,
    options: SearchOptions = {}
  ): ScoredDocument[] {
    const ast = this.parser.parse(query);
    return this.evaluate(ast, index, options);
  }

  /**
   * Evaluates an AST QueryNode against the index.
   */
  public evaluate(
    node: QueryNode,
    index: InvertedIndex,
    options: SearchOptions = {}
  ): ScoredDocument[] {
    const limit = options.limit ?? 10;
    const scorer = options.scorer ?? this.defaultScorer;

    // 1. Evaluate matching DocIDs from AST
    const matchedDocIds = this.evaluateNode(node, index, options);
    if (matchedDocIds.length === 0) {
      return [];
    }

    // 2. Extract scoring terms from the AST
    const scoringTerms = this.extractScoringTerms(node, index, options);

    // 3. Rank matching documents via BM25
    const ranked = scorer.rank(matchedDocIds, scoringTerms, index, limit);

    // 4. Generate highlighted snippets if requested
    if (options.highlight !== false) {
      const snippetLen = options.snippetLength ?? 150;
      for (const item of ranked) {
        item.snippet = this.generateSnippet(item, scoringTerms, snippetLen);
      }
    }

    return ranked;
  }

  private evaluateNode(
    node: QueryNode,
    index: InvertedIndex,
    options?: SearchOptions
  ): number[] {
    switch (node.type) {
      case 'TERM': {
        const termVal = (node as TermNode).value;
        const postings = index.getPostings(termVal);
        if (postings && postings.length > 0) {
          return postings.getAll().map((p) => p.docId);
        }

        // Automatic typo tolerance fallback when exact matches are empty
        if (options?.fuzzy !== false && termVal.length >= 3) {
          const maxDist =
            typeof options?.fuzzy === 'number'
              ? options.fuzzy
              : termVal.length >= 6
                ? 2
                : 1;
          const matches = index.searchFuzzy(termVal, maxDist);
          if (matches.length > 0) {
            const docSet = new Set<number>();
            for (const m of matches) {
              for (const p of m.postings) {
                docSet.add(p.docId);
              }
            }
            return Array.from(docSet).sort((a, b) => a - b);
          }
        }

        return [];
      }

      case 'FUZZY': {
        const fNode = node as FuzzyNode;
        const matches = index.searchFuzzy(fNode.term, fNode.maxDistance);
        if (matches.length === 0) return [];

        const docSet = new Set<number>();
        for (const m of matches) {
          for (const p of m.postings) {
            docSet.add(p.docId);
          }
        }
        return Array.from(docSet).sort((a, b) => a - b);
      }

      case 'PHRASE': {
        const pNode = node as PhraseNode;
        const phraseStr = pNode.terms.join(' ');
        const matches = index.searchPhrase(phraseStr, pNode.slop);
        return matches.map((m) => m.docId);
      }

      case 'PREFIX': {
        const prefix = (node as PrefixNode).prefix;
        const entries = index.searchPrefix(prefix);
        if (entries.length === 0) return [];

        const docSet = new Set<number>();
        for (const entry of entries) {
          for (const p of entry.postings) {
            docSet.add(p.docId);
          }
        }
        return Array.from(docSet).sort((a, b) => a - b);
      }

      case 'AND': {
        const children = (node as AndNode).children;
        if (children.length === 0) return [];

        let current = this.evaluateNode(children[0]!, index, options);
        for (let i = 1; i < children.length; i++) {
          if (current.length === 0) break;
          const next = new Set(this.evaluateNode(children[i]!, index, options));
          current = current.filter((id) => next.has(id));
        }
        return current;
      }

      case 'OR': {
        const children = (node as OrNode).children;
        if (children.length === 0) return [];

        const docSet = new Set<number>();
        for (const child of children) {
          const docs = this.evaluateNode(child, index, options);
          for (const d of docs) {
            docSet.add(d);
          }
        }
        return Array.from(docSet).sort((a, b) => a - b);
      }

      case 'NOT': {
        const excluded = new Set(this.evaluateNode((node as NotNode).child, index, options));
        const allDocIds = index.getDocumentIds();
        return allDocIds.filter((id) => !excluded.has(id));
      }

      default:
        return [];
    }
  }

  private extractScoringTerms(
    node: QueryNode,
    index: InvertedIndex,
    options?: SearchOptions
  ): string[] {
    const terms = new Set<string>();

    const traverse = (n: QueryNode) => {
      switch (n.type) {
        case 'TERM': {
          const val = (n as TermNode).value;
          const postings = index.getPostings(val);
          if (postings && postings.length > 0) {
            terms.add(val);
          } else if (options?.fuzzy !== false && val.length >= 3) {
            const maxDist =
              typeof options?.fuzzy === 'number'
                ? options.fuzzy
                : val.length >= 6
                  ? 2
                  : 1;
            const matches = index.searchFuzzy(val, maxDist);
            if (matches.length > 0) {
              for (const m of matches) {
                terms.add(m.term);
              }
            } else {
              terms.add(val);
            }
          } else {
            terms.add(val);
          }
          break;
        }

        case 'FUZZY': {
          const fNode = n as FuzzyNode;
          const matches = index.searchFuzzy(fNode.term, fNode.maxDistance);
          if (matches.length > 0) {
            for (const m of matches) {
              terms.add(m.term);
            }
          } else {
            terms.add(fNode.term);
          }
          break;
        }

        case 'PHRASE':
          for (const t of (n as PhraseNode).terms) {
            terms.add(t);
          }
          break;

        case 'PREFIX': {
          const matches = index.searchPrefix((n as PrefixNode).prefix);
          for (const m of matches) {
            terms.add(m.term);
          }
          break;
        }

        case 'AND':
        case 'OR':
          for (const child of (n as AndNode | OrNode).children) {
            traverse(child);
          }
          break;

        case 'NOT':
          // Excluded terms do not contribute positive score
          break;
      }
    };

    traverse(node);
    return Array.from(terms);
  }

  private generateSnippet(
    doc: ScoredDocument,
    terms: string[],
    maxChars: number
  ): string | undefined {
    if (!doc.fields) return undefined;

    // Pick text source from document fields
    const text =
      (doc.fields['body'] as string) ||
      (doc.fields['text'] as string) ||
      (doc.fields['content'] as string) ||
      (doc.fields['title'] as string) ||
      '';

    if (text.length === 0) return undefined;

    const lowerText = text.toLowerCase();
    const cleanTerms = terms
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 1);

    if (cleanTerms.length === 0) {
      return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
    }

    // Identify match positions in text
    let bestStart = -1;
    let maxDensity = 0;
    const matchIndices: number[] = [];

    for (const term of cleanTerms) {
      let idx = lowerText.indexOf(term);
      while (idx !== -1) {
        matchIndices.push(idx);
        idx = lowerText.indexOf(term, idx + term.length);
        if (matchIndices.length > 25) break;
      }
    }

    // If exact occurrences not found, check prefix match (stem)
    if (matchIndices.length === 0) {
      for (const term of cleanTerms) {
        const prefix = term.slice(0, Math.min(term.length, 4));
        const idx = lowerText.indexOf(prefix);
        if (idx !== -1) {
          matchIndices.push(idx);
          break;
        }
      }
    }

    if (matchIndices.length > 0) {
      matchIndices.sort((a, b) => a - b);
      for (let i = 0; i < matchIndices.length; i++) {
        const startCand = matchIndices[i]!;
        const endCand = startCand + maxChars;
        let count = 0;
        for (let j = i; j < matchIndices.length; j++) {
          if (matchIndices[j]! <= endCand) count++;
          else break;
        }
        if (count > maxDensity) {
          maxDensity = count;
          bestStart = startCand;
        }
      }
    }

    let start = 0;
    let end = Math.min(text.length, maxChars);

    if (bestStart !== -1) {
      const half = Math.floor(maxChars / 2);
      start = Math.max(0, bestStart - half);
      end = Math.min(text.length, start + maxChars);
    }

    let snippet = text.slice(start, end).trim();
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    // Highlight matched words (including word stems)
    for (const term of cleanTerms) {
      const escaped = escapeRegex(term);
      const regex = new RegExp(`\\b(${escaped}\\w*)\\b`, 'gi');
      snippet = snippet.replace(regex, (match) => {
        return match.startsWith('**') ? match : `**${match}**`;
      });
    }

    // Clean up any nested/overlapping bolds
    snippet = snippet.replace(/\*{4,}/g, '**');

    return snippet;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

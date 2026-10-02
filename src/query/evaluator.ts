import type { InvertedIndex } from '../index/inverted-index.js';
import { BM25Scorer } from '../ranking/bm25.js';
import type { ScoredDocument } from '../ranking/types.js';
import type { QueryNode, TermNode, PhraseNode, PrefixNode, AndNode, OrNode, NotNode } from './ast.js';
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
    const matchedDocIds = this.evaluateNode(node, index);
    if (matchedDocIds.length === 0) {
      return [];
    }

    // 2. Extract scoring terms from the AST
    const scoringTerms = this.extractScoringTerms(node, index);

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

  private evaluateNode(node: QueryNode, index: InvertedIndex): number[] {
    switch (node.type) {
      case 'TERM': {
        const postings = index.getPostings((node as TermNode).value);
        if (!postings) return [];
        return postings.getAll().map((p) => p.docId);
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

        let current = this.evaluateNode(children[0]!, index);
        for (let i = 1; i < children.length; i++) {
          if (current.length === 0) break;
          const next = new Set(this.evaluateNode(children[i]!, index));
          current = current.filter((id) => next.has(id));
        }
        return current;
      }

      case 'OR': {
        const children = (node as OrNode).children;
        if (children.length === 0) return [];

        const docSet = new Set<number>();
        for (const child of children) {
          const docs = this.evaluateNode(child, index);
          for (const d of docs) {
            docSet.add(d);
          }
        }
        return Array.from(docSet).sort((a, b) => a - b);
      }

      case 'NOT': {
        const excluded = new Set(this.evaluateNode((node as NotNode).child, index));
        const allDocIds = index.getDocumentIds();
        return allDocIds.filter((id) => !excluded.has(id));
      }

      default:
        return [];
    }
  }

  private extractScoringTerms(node: QueryNode, index: InvertedIndex): string[] {
    const terms = new Set<string>();

    const traverse = (n: QueryNode) => {
      switch (n.type) {
        case 'TERM':
          terms.add((n as TermNode).value);
          break;
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
      (doc.fields['title'] as string) ||
      '';

    if (text.length === 0) return undefined;

    // Find first occurrence of any query term
    const lower = text.toLowerCase();
    let firstIndex = -1;

    for (const term of terms) {
      const idx = lower.indexOf(term.toLowerCase());
      if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
        firstIndex = idx;
      }
    }

    if (firstIndex === -1) {
      return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
    }

    // Window around match
    const half = Math.floor(maxChars / 2);
    const start = Math.max(0, firstIndex - half);
    const end = Math.min(text.length, start + maxChars);

    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    // Highlight terms with markdown bold **term**
    for (const term of terms) {
      const regex = new RegExp(`\\b(${escapeRegex(term)})\\b`, 'gi');
      snippet = snippet.replace(regex, '**$1**');
    }

    return snippet;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

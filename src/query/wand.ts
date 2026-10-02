import type { InvertedIndex } from '../index/inverted-index.js';
import type { PostingsList } from '../index/postings-list.js';
import { BM25Scorer } from '../ranking/bm25.js';
import { MinHeap } from '../ranking/priority-queue.js';
import type { ScoredDocument } from '../ranking/types.js';

interface TermPostingCursor {
  term: string;
  postings: PostingsList;
  cursor: number;
  upperBound: number;
  currentDocId: number;
}

/**
 * Weak AND (WAND) dynamic query pruning algorithm (Broder et al. 2003).
 * Prunes non-competitive documents early by tracking maximum term score contributions
 * and dynamic Top-K score thresholds.
 */
export class WANDScorer {
  private readonly scorer: BM25Scorer;

  constructor(scorer?: BM25Scorer) {
    this.scorer = scorer ?? new BM25Scorer();
  }

  /**
   * Executes a WAND-pruned disjunctive query, returning the exact Top-K scored documents.
   */
  public search(
    terms: string[],
    index: InvertedIndex,
    limit: number = 10
  ): ScoredDocument[] {
    const stats = index.getStats();
    if (stats.totalDocuments === 0 || terms.length === 0) {
      return [];
    }

    const cursors: TermPostingCursor[] = [];

    // Initialize posting cursors and calculate upper-bound scores
    for (const term of terms) {
      const normalized = index.textAnalyzer.normalizeTerm(term);
      const postings = index.getPostings(normalized);
      if (!postings || postings.length === 0) continue;

      const idf = this.scorer.computeIDF(postings.docFrequency, stats.totalDocuments);
      // Mathematical upper bound of BM25 term score: IDF * (k1 + 1)
      const upperBound = idf * (this.scorer.k1 + 1);

      cursors.push({
        term: normalized,
        postings,
        cursor: 0,
        upperBound,
        currentDocId: postings.get(0)!.docId,
      });
    }

    if (cursors.length === 0) {
      return [];
    }

    const topKHeap = new MinHeap<ScoredDocument>(
      (a, b) => a.score - b.score,
      Math.max(1, limit)
    );

    let threshold = 0;

    while (cursors.length > 0) {
      // 1. Sort active cursors by currentDocId ascending
      cursors.sort((a, b) => a.currentDocId - b.currentDocId);

      // 2. Accumulate upper bounds until sum exceeds threshold
      let accumulatedScore = 0;
      let pivotIndex = -1;

      for (let i = 0; i < cursors.length; i++) {
        accumulatedScore += cursors[i]!.upperBound;
        if (accumulatedScore > threshold) {
          pivotIndex = i;
          break;
        }
      }

      // No subset of remaining terms can beat the current threshold
      if (pivotIndex === -1) {
        break;
      }

      const pivotCursor = cursors[pivotIndex]!;
      const pivotDocId = pivotCursor.currentDocId;

      // If the first cursor's docId matches the pivot, evaluate this candidate document
      if (cursors[0]!.currentDocId === pivotDocId) {
        const { score, matchedTerms } = this.scorer.scoreDocument(pivotDocId, terms, index);

        if (score > threshold) {
          const docRecord = index.getDocument(pivotDocId);
          topKHeap.push({
            docId: pivotDocId,
            score,
            matchedTerms,
            fields: docRecord?.fields,
          });

          // Update threshold if heap is full
          if (topKHeap.size >= limit) {
            threshold = topKHeap.peek()!.score;
          }
        }

        // Advance all cursors currently at pivotDocId
        for (let i = cursors.length - 1; i >= 0; i--) {
          const c = cursors[i]!;
          if (c.currentDocId === pivotDocId) {
            c.cursor++;
            if (c.cursor >= c.postings.length) {
              cursors.splice(i, 1);
            } else {
              c.currentDocId = c.postings.get(c.cursor)!.docId;
            }
          }
        }
      } else {
        // Advance leading cursors to at least pivotDocId
        for (let i = 0; i < pivotIndex; i++) {
          const c = cursors[i]!;
          while (c.cursor < c.postings.length && c.currentDocId < pivotDocId) {
            const skip = c.postings.getSkip(c.cursor);
            if (skip && skip.targetDocId <= pivotDocId) {
              c.cursor = skip.postingIndex;
            } else {
              c.cursor++;
            }
            if (c.cursor < c.postings.length) {
              c.currentDocId = c.postings.get(c.cursor)!.docId;
            }
          }

          if (c.cursor >= c.postings.length) {
            const idx = cursors.indexOf(c);
            if (idx >= 0) cursors.splice(idx, 1);
          }
        }
      }
    }

    return topKHeap.toSortedArray();
  }
}

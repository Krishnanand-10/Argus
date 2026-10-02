import type { InvertedIndex } from '../index/inverted-index.js';
import { MinHeap } from './priority-queue.js';
import type { ScoredDocument } from './types.js';

/**
 * Classic TF-IDF (Term Frequency - Inverse Document Frequency) relevance scorer.
 */
export class TFIDFScorer {
  /**
   * Computes standard smooth inverse document frequency:
   * IDF(t) = ln(1 + N / df)
   */
  public computeIDF(docFrequency: number, totalDocuments: number): number {
    if (totalDocuments <= 0 || docFrequency <= 0) return 0;
    return Math.log(1 + totalDocuments / docFrequency);
  }

  /**
   * Computes term frequency normalized by document length.
   */
  public computeTF(termFrequency: number, docLength: number): number {
    if (docLength <= 0 || termFrequency <= 0) return 0;
    return termFrequency / docLength;
  }

  /**
   * Scores a single document against an array of query terms.
   */
  public scoreDocument(
    docId: number,
    queryTerms: string[],
    index: InvertedIndex
  ): { score: number; matchedTerms: string[] } {
    const stats = index.getStats();
    const docLength = index.getDocLength(docId) ?? 0;
    const totalDocs = stats.totalDocuments;

    let totalScore = 0;
    const matchedTerms: string[] = [];

    for (const term of queryTerms) {
      const normalized = index.textAnalyzer.normalizeTerm(term);
      const postings = index.getPostings(normalized);
      if (!postings) continue;

      const posting = postings.getPostingForDoc(docId);
      if (!posting || posting.termFrequency <= 0) continue;

      const tf = this.computeTF(posting.termFrequency, docLength);
      const idf = this.computeIDF(postings.docFrequency, totalDocs);

      totalScore += tf * idf;
      matchedTerms.push(term);
    }

    return { score: totalScore, matchedTerms };
  }

  /**
   * Ranks candidate documents using TF-IDF and MinHeap priority queue.
   */
  public rank(
    matchedDocIds: Iterable<number>,
    queryTerms: string[],
    index: InvertedIndex,
    limit: number = 10
  ): ScoredDocument[] {
    const heap = new MinHeap<ScoredDocument>(
      (a, b) => a.score - b.score,
      Math.max(1, limit)
    );

    for (const docId of matchedDocIds) {
      const { score, matchedTerms } = this.scoreDocument(docId, queryTerms, index);
      if (score > 0) {
        const docRecord = index.getDocument(docId);
        heap.push({
          docId,
          score,
          matchedTerms,
          fields: docRecord?.fields,
        });
      }
    }

    return heap.toSortedArray();
  }
}

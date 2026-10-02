import type { InvertedIndex } from '../index/inverted-index.js';
import { MinHeap } from './priority-queue.js';
import type { BM25Options, ScoredDocument } from './types.js';

/**
 * High-performance Okapi BM25 relevance scorer.
 * Implements Robertson-Spärck Jones IDF and non-linear term frequency saturation.
 */
export class BM25Scorer {
  public readonly k1: number;
  public readonly b: number;

  constructor(options: BM25Options = {}) {
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
  }

  /**
   * Computes Robertson-Spärck Jones Inverse Document Frequency (IDF):
   * IDF(t) = ln( (N - n(t) + 0.5) / (n(t) + 0.5) + 1 )
   */
  public computeIDF(docFrequency: number, totalDocuments: number): number {
    if (totalDocuments <= 0 || docFrequency <= 0) return 0;
    const numerator = totalDocuments - docFrequency + 0.5;
    const denominator = docFrequency + 0.5;
    return Math.log(numerator / denominator + 1);
  }

  /**
   * Computes BM25 score contribution for a single term in a document.
   */
  public scoreTerm(
    termFrequency: number,
    docLength: number,
    avgDocLength: number,
    idf: number
  ): number {
    if (termFrequency <= 0 || idf <= 0) return 0;

    const norm = avgDocLength > 0 ? docLength / avgDocLength : 1;
    const denominator = termFrequency + this.k1 * (1 - this.b + this.b * norm);
    const numerator = termFrequency * (this.k1 + 1);

    return idf * (numerator / denominator);
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
    const avgDocLength = stats.averageDocLength;
    const totalDocs = stats.totalDocuments;

    let totalScore = 0;
    const matchedTerms: string[] = [];

    for (const term of queryTerms) {
      const postings = index.getPostings(term);
      if (!postings) continue;

      const posting = postings.getPostingForDoc(docId);
      if (!posting || posting.termFrequency <= 0) continue;

      const idf = this.computeIDF(postings.docFrequency, totalDocs);
      const termScore = this.scoreTerm(
        posting.termFrequency,
        docLength,
        avgDocLength,
        idf
      );

      totalScore += termScore;
      matchedTerms.push(term);
    }

    return { score: totalScore, matchedTerms };
  }

  /**
   * Scores and ranks candidate document IDs, extracting the top K using a binary MinHeap.
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

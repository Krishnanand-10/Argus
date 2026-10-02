/**
 * Represents a document scored and ranked by relevance algorithms.
 */
export interface ScoredDocument {
  /** Numerical document ID */
  docId: number;
  /** Calculated relevance score (e.g. Okapi BM25) */
  score: number;
  /** Terms that contributed to this document's relevance score */
  matchedTerms: string[];
  /** Optional contextual text snippet with keyword highlights */
  snippet?: string;
  /** Stored document metadata or fields */
  fields?: Record<string, unknown>;
}

/**
 * Tunable hyperparameters for the Okapi BM25 scoring algorithm.
 */
export interface BM25Options {
  /**
   * Term frequency saturation parameter (default: 1.2).
   * Controls how quickly additional occurrences of a term saturate the score.
   */
  k1?: number;
  /**
   * Document length normalization parameter (default: 0.75).
   * Controls the penalization applied to longer-than-average documents (0 = no penalty, 1 = full penalty).
   */
  b?: number;
}

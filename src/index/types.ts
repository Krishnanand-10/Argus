/**
 * Positional posting entry for a specific document.
 */
export interface Posting {
  /** Monotonically increasing document ID */
  docId: number;
  /** Number of occurrences of the term in the document */
  termFrequency: number;
  /** 0-indexed word positions where the term occurred in the document */
  positions: number[];
}

/**
 * Skip pointer for jumping forward in postings lists during accelerated list intersection.
 */
export interface SkipPointer {
  /** Target docId at the skip destination */
  targetDocId: number;
  /** Index in the postings array where the skip lands */
  postingIndex: number;
}

/**
 * Term statistics stored in the Lexicon / Term Dictionary.
 */
export interface TermMetadata {
  /** The normalized term string */
  term: string;
  /** Number of unique documents containing this term (document frequency) */
  docFrequency: number;
  /** Total count of this term across the entire corpus */
  totalTermFrequency: number;
  /** Optional byte offset in the serialized binary .argus file */
  offset?: number;
}

/**
 * Metadata for a document recorded in the index.
 */
export interface IndexedDocument {
  /** Unique numerical document ID */
  id: number;
  /** Total token count (document length) */
  length: number;
  /** Optional original fields or document payload */
  fields?: Record<string, unknown>;
}

/**
 * Global index statistics used for relevance ranking (Okapi BM25) and telemetry.
 */
export interface IndexStatistics {
  /** Total number of indexed documents */
  totalDocuments: number;
  /** Total number of unique terms in the lexicon */
  totalTerms: number;
  /** Total tokens indexed across all documents */
  totalTokens: number;
  /** Average document length (|D| / N) across corpus */
  averageDocLength: number;
}

/**
 * Document structure accepted by the indexing engine.
 */
export interface IndexableDocument {
  /** Unique numerical document ID */
  id: number;
  /** Optional document title */
  title?: string;
  /** Optional document body text */
  body?: string;
  /** Optional raw plaintext content */
  text?: string;
  /** Additional metadata or custom fields */
  [key: string]: unknown;
}

/**
 * Result of an exact positional phrase match.
 */
export interface PhraseMatch {
  /** Document ID where the phrase matched */
  docId: number;
  /** Starting word positions of the matched phrase in the document */
  matchPositions: number[];
}

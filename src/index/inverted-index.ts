import { Analyzer } from '../analyzer/index.js';
import { TermDictionary, TermEntry } from './dictionary.js';
import { PostingsList } from './postings-list.js';
import { intersectMultiple, unionMultiple, intersectPhrase } from './skip-list.js';
import type {
  IndexableDocument,
  IndexedDocument,
  IndexStatistics,
  PhraseMatch,
  TermMetadata,
} from './types.js';

export interface InvertedIndexOptions {
  /** Custom text analyzer instance (defaults to standard Analyzer) */
  analyzer?: Analyzer;
  /** Whether to retain document fields in memory for result retrieval (default: true) */
  storeFields?: boolean;
}

/**
 * Main in-memory Inverted Index engine with positional postings.
 * Coordinates document ingestion, text analysis, lexicon updates, and retrieval operations.
 */
export class InvertedIndex {
  private readonly analyzer: Analyzer;
  private readonly dictionary: TermDictionary = new TermDictionary();
  private readonly documents: Map<number, IndexedDocument> = new Map();
  private readonly storeFields: boolean;
  private _totalTokens: number = 0;

  constructor(options: InvertedIndexOptions = {}) {
    this.analyzer = options.analyzer ?? new Analyzer();
    this.storeFields = options.storeFields ?? true;
  }

  /**
   * Access to the underlying text analyzer.
   */
  public get textAnalyzer(): Analyzer {
    return this.analyzer;
  }

  /**
   * Access to the term dictionary (lexicon).
   */
  public get termDictionary(): TermDictionary {
    return this.dictionary;
  }

  /**
   * Adds and indexes a single document into the inverted index.
   */
  public addDocument(doc: IndexableDocument): void {
    if (this.documents.has(doc.id)) {
      throw new Error(`Document with ID ${doc.id} already exists in the index.`);
    }

    const text = this.extractDocumentText(doc);
    const tokens = this.analyzer.analyze(text);
    const docLength = tokens.length;

    const indexedDoc: IndexedDocument = {
      id: doc.id,
      length: docLength,
      fields: this.storeFields ? { ...doc } : undefined,
    };

    this.documents.set(doc.id, indexedDoc);
    this._totalTokens += docLength;

    // Index all tokens with their positions
    for (const token of tokens) {
      const termEntry = this.dictionary.getOrCreate(token.term);
      termEntry.postings.add(doc.id, token.position);
    }
  }

  /**
   * Batch adds multiple documents to the index.
   */
  public addDocuments(docs: IndexableDocument[]): void {
    for (const doc of docs) {
      this.addDocument(doc);
    }
  }

  /**
   * Builds skip pointers across all postings lists for accelerated query intersections.
   */
  public buildSkipPointers(): void {
    for (const entry of this.dictionary.entries()) {
      entry.postings.buildSkips();
    }
  }

  /**
   * Retrieves the positional postings list for a given term.
   * Automatically normalizes the term with the analyzer.
   */
  public getPostings(term: string): PostingsList | undefined {
    const normalized = this.analyzer.normalizeTerm(term);
    return this.dictionary.get(normalized)?.postings;
  }

  /**
   * Retrieves term metadata (docFrequency, totalTermFrequency) for a term.
   */
  public getTermMetadata(term: string): TermMetadata | undefined {
    const normalized = this.analyzer.normalizeTerm(term);
    const entry = this.dictionary.get(normalized);
    if (!entry) return undefined;

    return {
      term: entry.term,
      docFrequency: entry.docFrequency,
      totalTermFrequency: entry.totalTermFrequency,
      offset: entry.offset,
    };
  }

  /**
   * Retrieves metadata and stored payload for an indexed document.
   */
  public getDocument(docId: number): IndexedDocument | undefined {
    return this.documents.get(docId);
  }

  /**
   * Returns all indexed documents.
   */
  public getAllDocuments(): IndexedDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Returns all indexed document IDs.
   */
  public getDocumentIds(): number[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Restores an InvertedIndex instance from a deserialized snapshot.
   */
  public restoreFromSnapshot(
    documents: IndexedDocument[],
    termEntries: Array<{ term: string; postings: PostingsList; offset?: number }>,
    totalTokens: number
  ): void {
    this.documents.clear();
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }

    for (const entry of termEntries) {
      const termEntry = this.dictionary.getOrCreate(entry.term);
      for (const posting of entry.postings.getAll()) {
        for (const pos of posting.positions) {
          termEntry.postings.add(posting.docId, pos);
        }
      }
      termEntry.offset = entry.offset;
    }

    this._totalTokens = totalTokens;
    this.buildSkipPointers();
  }

  /**
   * Retrieves the token length of a document (|D|).
   */
  public getDocLength(docId: number): number | undefined {
    return this.documents.get(docId)?.length;
  }

  /**
   * Returns corpus-wide statistics for relevance scoring (Okapi BM25) and telemetry.
   */
  public getStats(): IndexStatistics {
    const totalDocs = this.documents.size;
    return {
      totalDocuments: totalDocs,
      totalTerms: this.dictionary.size,
      totalTokens: this._totalTokens,
      averageDocLength: totalDocs > 0 ? this._totalTokens / totalDocs : 0,
    };
  }

  /**
   * Evaluates a Boolean AND query across multiple terms.
   * Returns matching document IDs.
   */
  public searchBooleanAnd(terms: string[]): number[] {
    if (terms.length === 0) return [];

    const postingsLists: PostingsList[] = [];
    for (const term of terms) {
      const postings = this.getPostings(term);
      if (!postings || postings.length === 0) {
        return []; // If any term is not in corpus, AND query yields 0 results
      }
      postingsLists.push(postings);
    }

    return intersectMultiple(postingsLists);
  }

  /**
   * Evaluates a Boolean OR query across multiple terms.
   * Returns sorted matching document IDs.
   */
  public searchBooleanOr(terms: string[]): number[] {
    if (terms.length === 0) return [];

    const postingsLists: PostingsList[] = [];
    for (const term of terms) {
      const postings = this.getPostings(term);
      if (postings && postings.length > 0) {
        postingsLists.push(postings);
      }
    }

    return unionMultiple(postingsLists);
  }

  /**
   * Searches for exact phrases (consecutive words in document) with optional slop.
   */
  public searchPhrase(phrase: string, slop: number = 0): PhraseMatch[] {
    const tokens = this.analyzer.analyze(phrase);
    if (tokens.length === 0) return [];

    const postingsLists: PostingsList[] = [];
    for (const token of tokens) {
      const entry = this.dictionary.get(token.term);
      if (!entry || entry.postings.length === 0) {
        return [];
      }
      postingsLists.push(entry.postings);
    }

    return intersectPhrase(postingsLists, slop);
  }

  /**
   * Searches for terms beginning with the given prefix (e.g. `distrib*`).
   */
  public searchPrefix(prefix: string): TermEntry[] {
    const normalizedPrefix = prefix.toLowerCase();
    return this.dictionary.prefixSearch(normalizedPrefix);
  }

  /**
   * Extracts combined searchable text from a document's fields.
   */
  private extractDocumentText(doc: IndexableDocument): string {
    if (doc.text !== undefined && typeof doc.text === 'string') {
      return doc.text;
    }

    const parts: string[] = [];
    if (typeof doc.title === 'string' && doc.title.length > 0) {
      parts.push(doc.title);
    }
    if (typeof doc.body === 'string' && doc.body.length > 0) {
      parts.push(doc.body);
    }

    if (parts.length > 0) {
      return parts.join(' ');
    }

    // Fallback: collect all top-level string values
    for (const [key, val] of Object.entries(doc)) {
      if (key !== 'id' && typeof val === 'string') {
        parts.push(val);
      }
    }

    return parts.join(' ');
  }
}

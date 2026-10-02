import { Analyzer, type AnalyzerOptions } from './analyzer/index.js';
import { InvertedIndex, type IndexableDocument, type IndexStatistics } from './index/index.js';
import { BM25Scorer } from './ranking/bm25.js';
import type { BM25Options, ScoredDocument } from './ranking/types.js';
import { QueryEvaluator, type SearchOptions } from './query/evaluator.js';
import { writeIndexToFile, readIndexFromFile } from './storage/index.js';
import { WriteAheadLog } from './storage/wal.js';

export interface ArgusEngineOptions extends AnalyzerOptions, BM25Options {
  /** Optional file path to maintain an append-only Write-Ahead Log */
  walPath?: string;
  /** Whether to retain document fields in memory for search snippets (default: true) */
  storeFields?: boolean;
}

/**
 * ArgusEngine is the unified, high-level interface to the Argus Search Engine.
 * Integrates text analysis, positional indexing, BM25 probabilistic ranking,
 * AST boolean/phrase query evaluation, and binary disk persistence.
 */
export class ArgusEngine {
  private readonly analyzer: Analyzer;
  private readonly index: InvertedIndex;
  private readonly scorer: BM25Scorer;
  private readonly evaluator: QueryEvaluator;
  private readonly wal: WriteAheadLog | null = null;

  constructor(options: ArgusEngineOptions = {}) {
    this.analyzer = new Analyzer(options);
    this.index = new InvertedIndex({
      analyzer: this.analyzer,
      storeFields: options.storeFields ?? true,
    });
    this.scorer = new BM25Scorer({
      k1: options.k1 ?? 1.2,
      b: options.b ?? 0.75,
    });
    this.evaluator = new QueryEvaluator();

    if (options.walPath) {
      this.wal = new WriteAheadLog(options.walPath);
    }
  }

  /**
   * Access to the underlying InvertedIndex.
   */
  public get invertedIndex(): InvertedIndex {
    return this.index;
  }

  /**
   * Indexes a single document.
   */
  public async addDocument(doc: IndexableDocument): Promise<void> {
    if (this.wal) {
      await this.wal.append(doc);
    }
    this.index.addDocument(doc);
  }

  /**
   * Batch indexes multiple documents.
   */
  public async addDocuments(docs: IndexableDocument[]): Promise<void> {
    for (const doc of docs) {
      await this.addDocument(doc);
    }
    this.index.buildSkipPointers();
  }

  /**
   * Evaluates a search query with full Boolean logic, exact phrases, prefixes, and Okapi BM25 ranking.
   */
  public search(query: string, options: SearchOptions = {}): ScoredDocument[] {
    return this.evaluator.search(query, this.index, {
      scorer: this.scorer,
      ...options,
    });
  }

  /**
   * Returns autocomplete suggestions for a given term prefix, ranked by frequency.
   */
  public suggest(prefix: string, limit: number = 5): string[] {
    return this.index.suggest(prefix, limit);
  }

  /**
   * Serializes and persists the active index to an .argus binary file on disk.
   */
  public async commit(filePath: string): Promise<void> {
    this.index.buildSkipPointers();
    await writeIndexToFile(this.index, filePath);
    if (this.wal) {
      await this.wal.checkpoint();
    }
  }

  /**
   * Replays uncommitted documents from the WAL if configured.
   */
  public async recover(): Promise<number> {
    if (!this.wal) return 0;
    const restored = await this.wal.replay(this.index);
    if (restored > 0) {
      this.index.buildSkipPointers();
    }
    return restored;
  }

  /**
   * Returns corpus statistics.
   */
  public getStats(): IndexStatistics {
    return this.index.getStats();
  }

  /**
   * Loads a serialized .argus index file from disk into an ArgusEngine instance.
   */
  public static async load(
    filePath: string,
    options: ArgusEngineOptions = {}
  ): Promise<ArgusEngine> {
    const engine = new ArgusEngine(options);
    const loadedIndex = await readIndexFromFile(filePath, {
      analyzer: engine.analyzer,
      storeFields: options.storeFields ?? true,
    });

    // Restore into engine's index
    engine.index.restoreFromSnapshot(
      loadedIndex.getAllDocuments(),
      loadedIndex.termDictionary.entries(),
      loadedIndex.getStats().totalTokens
    );

    return engine;
  }
}
